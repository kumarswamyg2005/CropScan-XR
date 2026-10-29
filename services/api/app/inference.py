"""ONNX inference, Grad-CAM overlay and the abstain decision.

The session is loaded once at startup. Nothing about the model is hardcoded
here -- input size, normalization and both abstain thresholds come from
meta.json, which ml/export.py writes. If the model changes, the server does not.

The exported graph emits two outputs, logits and cam. See ml/export.py for why
the CAM needs no gradients: for a global-average-pool plus linear head the
Grad-CAM weights reduce to the classifier weights, so it is one forward pass.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from app.config import get_settings

# A leaf photo that decodes to a billion pixels is a decompression bomb, not a
# leaf photo. Pillow's own guard, set explicitly rather than left at the default.
Image.MAX_IMAGE_PIXELS = 64_000_000

# Uploads are decoded at most this big. The model sees 224 px; a full 24 MP phone
# photo decoded three times over pushed the process past the 512 MB server limit.
MAX_SIDE = 1600

# A photo with almost no detail (lens covered, blank or single-colour image) is
# refused before the model can name a disease in it. Real field photos measured
# >= 14.9 grey-level standard deviation (1,500 PlantDoc/PlantWild/Potato photos).
MIN_DETAIL = 6.0


# The model's own "this photo is not a crop leaf" class. It is never a diagnosis.
NOT_A_LEAF = "Not_a_leaf"

# A picked crop that the full model gives almost no weight to is a wrong pick (a
# cherry leaf scanned as Chilli), not a look-alike to rescue. Restricting the
# softmax to that crop would rescale its last 0.1% into a confident answer.
# Tuned on validation logits of the live model, every wrong pick simulated: the
# largest cut-off before right-crop losses rise (0.68% at 0.01 and 0.02, 0.97% at
# 0.05). On test it cuts wrong-crop scans answered with a disease from 31.3% to
# 0.61%, and loses 0.66% of correct right-crop answers.
CROP_MASS_MIN = 0.02


class ModelUnavailable(RuntimeError):
    """No model on disk. /predict 503s rather than inventing an answer."""


@dataclass(frozen=True)
class Prediction:
    status: str                 # "ok" | "uncertain"
    disease_id: str | None
    confidence: float
    top3: list[dict]
    entropy: float
    model_version: str
    cam: np.ndarray | None      # [H, W] for the predicted class, 0..1
    looks_like: str | None = None  # the full model's class when the picked crop is implausible


@dataclass
class LoadedModel:
    session: object
    labels: list[str]
    meta: dict

    @property
    def version(self) -> str:
        return f"{self.meta['model_name']}@{self.meta.get('git_sha', 'unknown')[:8]}"


@lru_cache(maxsize=1)
def load_model() -> LoadedModel:
    settings = get_settings()
    model_dir = Path(settings.model_dir)
    onnx_path = model_dir / "model.onnx"

    missing = [p.name for p in (onnx_path, model_dir / "labels.json", model_dir / "meta.json")
               if not p.exists()]
    if missing:
        raise ModelUnavailable(
            f"missing {', '.join(missing)} in {model_dir}. Run ml/export.py."
        )

    import onnxruntime as ort

    # The arena and memory-pattern planner cost ~80 MB on the int8 BioCLIP
    # model and buy nothing here: one image at a time, same latency without.
    opts = ort.SessionOptions()
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    session = ort.InferenceSession(str(onnx_path), opts, providers=["CPUExecutionProvider"])
    labels = json.loads((model_dir / "labels.json").read_text())
    meta = json.loads((model_dir / "meta.json").read_text())

    if len(labels) != meta["num_classes"]:
        raise ModelUnavailable("labels.json and meta.json disagree on class count")
    return LoadedModel(session=session, labels=labels, meta=meta)


def decode_image(raw: bytes) -> Image.Image:
    """Validate real image bytes, not just a content-type header, and strip EXIF.

    Two separate jobs. Pillow's verify() consumes the file object, so the image
    is opened twice on purpose -- that is the documented way to use it.
    """
    try:
        Image.open(io.BytesIO(raw)).verify()
        image = Image.open(io.BytesIO(raw))
        image.draft("RGB", (MAX_SIDE, MAX_SIDE))  # JPEG: decode at reduced scale; no-op otherwise
        image.load()
    except Exception as exc:
        raise ValueError("Could not decode the uploaded file as an image.") from exc

    # Honour the EXIF orientation flag before discarding EXIF, otherwise phone
    # photos arrive rotated. Re-encoding through raw pixel data drops every
    # other EXIF field, GPS included.
    from PIL import ImageOps

    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))

    # Rebuild from raw pixels. Nothing but the pixels survives, so GPS
    # coordinates of someone's farm cannot ride along into object storage.
    return Image.frombytes("RGB", image.size, image.tobytes())


def preprocess(image: Image.Image, meta: dict) -> np.ndarray:
    size = meta["input_size"]
    # Resize-then-centre-crop by default. A model evaluated with a plain resize
    # says so with resize_ratio 1.0, and the crop becomes a no-op.
    ratio = meta.get("resize_ratio", 1.14)
    resized = image.resize((int(size * ratio),) * 2, Image.Resampling.BILINEAR)
    left = (resized.width - size) // 2
    top = (resized.height - size) // 2
    cropped = resized.crop((left, top, left + size, top + size))

    x = np.asarray(cropped, dtype=np.float32) / 255.0
    mean = np.array(meta["normalization"]["mean"], dtype=np.float32)
    std = np.array(meta["normalization"]["std"], dtype=np.float32)
    x = (x - mean) / std
    return np.transpose(x, (2, 0, 1))[None].astype(np.float32)


def _softmax(logits: np.ndarray) -> np.ndarray:
    z = logits - logits.max()
    e = np.exp(z)
    return e / e.sum()


def predict(image: Image.Image, allowed: set[str] | None = None) -> Prediction:
    """allowed: the class ids the user's chosen crop can be (None = any crop). Not_a_leaf
    always competes, so a photo of a person stays "not a leaf" whatever crop is chosen."""
    model = load_model()
    x = preprocess(image, model.meta)
    logits, cam = model.session.run(None, {"input": x})

    scores = logits[0]
    wrong_crop = False
    if allowed is not None:
        full = _softmax(scores)
        in_crop = np.array([label in allowed for label in model.labels])
        full_top = model.labels[int(full.argmax())]
        wrong_crop = full[in_crop].sum() < CROP_MASS_MIN and full_top != NOT_A_LEAF
        if not wrong_crop:   # a wrong pick keeps the full model's scores: they are the honest ones
            scores = np.where(in_crop | (np.array(model.labels) == NOT_A_LEAF), scores, -np.inf)
    probs = _softmax(scores)
    order = np.argsort(probs)[::-1]
    top3 = [{"disease_id": model.labels[i], "confidence": float(probs[i])} for i in order[:3] if probs[i] > 0]

    confidence = float(probs[order[0]])
    entropy = float(-(probs * np.log(probs + 1e-12)).sum() / math.log(len(probs)))

    # Both conditions must pass. A high top-1 with a broad messy tail is exactly
    # the case entropy is here to catch.
    top_index = int(order[0])
    detail = float(np.asarray(image.convert("L").resize((64, 64)), dtype=np.float32).std())
    confident = (
        detail >= MIN_DETAIL
        and confidence >= model.meta["confidence_threshold"]
        and entropy <= model.meta["entropy_threshold"]
        and model.labels[top_index] != NOT_A_LEAF
    )
    accepted = confident and not wrong_crop
    # Name the crop it looks like only when the full model would have answered with it.
    # A leaf of a plant it was never taught (banana, cabbage) gets the plain "not sure"
    # message instead of "looks like Tomato": on 2,308 such photos, 77% -> 36% named.
    looks_like = model.labels[top_index] if wrong_crop and confident else None

    return Prediction(
        status="ok" if accepted else "uncertain",
        disease_id=model.labels[top_index] if accepted else None,
        confidence=confidence,
        top3=top3,
        entropy=entropy,
        model_version=model.version,
        cam=_normalize_cam(cam[0][top_index]) if accepted else None,
        looks_like=looks_like,
    )


def _normalize_cam(cam: np.ndarray) -> np.ndarray:
    cam = np.maximum(cam, 0)
    peak = cam.max()
    return cam / peak if peak > 0 else cam


def cam_overlay(image: Image.Image, cam: np.ndarray, alpha: float = 0.45) -> bytes:
    """Blend the CAM over the original photo and return PNG bytes.

    ponytail: a three-stop colour ramp computed with numpy rather than a
    matplotlib colormap. It keeps matplotlib out of the API image entirely for
    about eight lines. Swap in a real colormap only if the ramp reads badly.
    """
    heat = Image.fromarray((cam * 255).astype(np.uint8), mode="L")
    heat = heat.resize(image.size, Image.Resampling.BICUBIC)
    h = np.asarray(heat, dtype=np.float32) / 255.0

    # transparent-cool -> warm -> hot, matching the specimen palette
    r = np.clip(1.6 * h, 0, 1)
    g = np.clip(1.6 * h - 0.55, 0, 1)
    b = np.clip(2.2 * h - 1.7, 0, 1)
    coloured = np.stack([r, g, b], axis=-1)

    base = np.asarray(image, dtype=np.float32) / 255.0
    weight = (h * alpha)[..., None]
    blended = base * (1 - weight) + coloured * weight

    out = Image.fromarray((blended * 255).astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()
