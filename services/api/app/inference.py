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

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
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
        image.load()
    except Exception as exc:
        raise ValueError("Could not decode the uploaded file as an image.") from exc

    # Honour the EXIF orientation flag before discarding EXIF, otherwise phone
    # photos arrive rotated. Re-encoding through raw pixel data drops every
    # other EXIF field, GPS included.
    from PIL import ImageOps

    image = ImageOps.exif_transpose(image).convert("RGB")

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


def predict(image: Image.Image) -> Prediction:
    model = load_model()
    x = preprocess(image, model.meta)
    logits, cam = model.session.run(None, {"input": x})

    probs = _softmax(logits[0])
    order = np.argsort(probs)[::-1]
    top3 = [{"disease_id": model.labels[i], "confidence": float(probs[i])} for i in order[:3]]

    confidence = float(probs[order[0]])
    entropy = float(-(probs * np.log(probs + 1e-12)).sum() / math.log(len(probs)))

    # Both conditions must pass. A high top-1 with a broad messy tail is exactly
    # the case entropy is here to catch.
    accepted = (
        confidence >= model.meta["confidence_threshold"]
        and entropy <= model.meta["entropy_threshold"]
    )

    top_index = int(order[0])
    return Prediction(
        status="ok" if accepted else "uncertain",
        disease_id=model.labels[top_index] if accepted else None,
        confidence=confidence,
        top3=top3,
        entropy=entropy,
        model_version=model.version,
        cam=_normalize_cam(cam[0][top_index]) if accepted else None,
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
