"""Measure the deployed baseline and write docs/eval_metrics.json.

The model behind the API is the EfficientNet-B0 in backend/model.pt (torchvision,
trained by ml/train.ipynb). ml/export.py refuses to export without measured
metrics and tuned abstain thresholds; this produces both, for that model.

    lab    PlantVillage, the 10% stratified split drawn with one seed-42 stream:
           the same 4,333 images the in-domain benchmark uses
    field  every PlantDoc image (2,569), its 28 labels mapped onto our 38
    ood    Imagenette-160 validation (3,925): ten ImageNet classes, none a plant.
           The rejection set the abstain thresholds are tuned against.

Preprocessing is a plain 224x224 resize, matching how the model was evaluated;
export writes resize_ratio=1.0 so the API does the same.

    python ml/eval_baseline.py            # needs torch, torchvision, datasets, sklearn
"""

from __future__ import annotations

import json
import random
import tarfile
import urllib.request
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from datasets import load_dataset
from PIL import Image
from sklearn.metrics import precision_recall_fscore_support
from torchvision import models, transforms

from ood import accept, expected_calibration_error, tune_thresholds

ROOT = Path(__file__).resolve().parents[1]
SEED = 42
IMAGENETTE_URL = "https://s3.amazonaws.com/fast-ai-imageclas/imagenette2-160.tgz"
CACHE = Path.home() / ".cache" / "cropscan"

TF = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# PlantDoc's 28 labels -> our 38-class space. PlantDoc has no healthy-potato
# class, and 10 of ours never appear in it as ground truth.
PLANTDOC_TO_PV = {
    "Apple Scab Leaf": "Apple___Apple_scab",
    "Apple leaf": "Apple___healthy",
    "Apple rust leaf": "Apple___Cedar_apple_rust",
    "Bell_pepper leaf": "Pepper,_bell___healthy",
    "Bell_pepper leaf spot": "Pepper,_bell___Bacterial_spot",
    "Blueberry leaf": "Blueberry___healthy",
    "Cherry leaf": "Cherry_(including_sour)___healthy",
    "Corn Gray leaf spot": "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
    "Corn leaf blight": "Corn_(maize)___Northern_Leaf_Blight",
    "Corn rust leaf": "Corn_(maize)___Common_rust_",
    "Peach leaf": "Peach___healthy",
    "Potato leaf early blight": "Potato___Early_blight",
    "Potato leaf late blight": "Potato___Late_blight",
    "Raspberry leaf": "Raspberry___healthy",
    "Soyabean leaf": "Soybean___healthy",
    "Squash Powdery mildew leaf": "Squash___Powdery_mildew",
    "Strawberry leaf": "Strawberry___healthy",
    "Tomato Early blight leaf": "Tomato___Early_blight",
    "Tomato Septoria leaf spot": "Tomato___Septoria_leaf_spot",
    "Tomato leaf": "Tomato___healthy",
    "Tomato leaf bacterial spot": "Tomato___Bacterial_spot",
    "Tomato leaf late blight": "Tomato___Late_blight",
    "Tomato leaf mosaic virus": "Tomato___Tomato_mosaic_virus",
    "Tomato leaf yellow virus": "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato mold leaf": "Tomato___Leaf_Mold",
    "Tomato two spotted spider mites leaf": "Tomato___Spider_mites Two-spotted_spider_mite",
    "grape leaf": "Grape___healthy",
    "grape leaf black rot": "Grape___Black_rot",
}


def load_b0(num_classes: int) -> nn.Module:
    model = models.efficientnet_b0(weights=None)
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.4, inplace=True),
        nn.Linear(model.classifier[1].in_features, num_classes),
    )
    ckpt = torch.load(ROOT / "backend" / "model.pt", map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    return model.eval()


@torch.no_grad()
def logits_for(model: nn.Module, images, batch: int = 64) -> np.ndarray:
    out, buf = [], []
    for img in images:
        buf.append(TF(img.convert("RGB")))
        if len(buf) == batch:
            out.append(model(torch.stack(buf)).numpy())
            buf = []
    if buf:
        out.append(model(torch.stack(buf)).numpy())
    return np.concatenate(out)


def stratified_split(labels: list[int], n_classes: int) -> list[int]:
    """One seeded stream across all classes; reseeding per class would
    correlate the draws."""
    by_class = {i: [] for i in range(n_classes)}
    for idx, lbl in enumerate(labels):
        by_class[lbl].append(idx)
    rng = random.Random(SEED)
    picked = []
    for idxs in by_class.values():
        picked.extend(rng.sample(idxs, max(1, int(len(idxs) * 0.10))))
    return sorted(picked)


def imagenette_val() -> list[Path]:
    root = CACHE / "imagenette2-160"
    if not root.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        archive = CACHE / "imagenette2-160.tgz"
        print(f"downloading {IMAGENETTE_URL}")
        urllib.request.urlretrieve(IMAGENETTE_URL, archive)
        with tarfile.open(archive) as tar:
            tar.extractall(CACHE, filter="data")
        archive.unlink()
    return sorted((root / "val").rglob("*.JPEG"))


def macro_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Over the classes actually present as ground truth."""
    _, _, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", labels=sorted(set(y_true)), zero_division=0)
    return float(f1)


def main() -> int:
    class_names = json.loads((ROOT / "backend" / "class_names.json").read_text())
    idx = {n: i for i, n in enumerate(class_names)}
    model = load_b0(len(class_names))

    pv = load_dataset("GVJahnavi/PlantVillage_dataset", split="train")
    norm = lambda s: "".join(c.lower() for c in s if c.isalnum())  # noqa: E731
    assert [norm(a) for a in pv.features["label"].names] == [norm(b) for b in class_names], \
        "PlantVillage label order differs from class_names.json"
    test = stratified_split(pv["label"], len(class_names))
    print(f"lab: {len(test):,} PlantVillage images")
    lab_y = np.array([pv[i]["label"] for i in test])
    lab_logits = logits_for(model, (pv[i]["image"] for i in test))

    pd = load_dataset("Project-AgML/plant_doc_classification", split="train")
    pd_names = pd.features["label"].names
    print(f"field: {len(pd):,} PlantDoc images")
    field_y = np.array([idx[PLANTDOC_TO_PV[pd_names[s["label"]]]] for s in pd])
    field_logits = logits_for(model, (s["image"] for s in pd))

    ood_paths = imagenette_val()
    print(f"ood: {len(ood_paths):,} Imagenette images")
    ood_logits = logits_for(model, (Image.open(p) for p in ood_paths))

    lab_pred, field_pred = lab_logits.argmax(1), field_logits.argmax(1)
    lab_acc = float((lab_pred == lab_y).mean())
    field_acc = float((field_pred == field_y).mean())
    ece, _ = expected_calibration_error(lab_logits, lab_pred == lab_y)
    thresholds = tune_thresholds(lab_logits, ood_logits)

    kept = accept(field_logits, thresholds["msp_threshold"], thresholds["entropy_threshold"])
    metrics = {
        "model": "efficientnet_b0 (torchvision), backend/model.pt",
        "lab_acc": lab_acc,
        "field_acc": field_acc,
        "macro_f1_field": macro_f1(field_y, field_pred),
        "ece": ece,
        "domain_gap": lab_acc - field_acc,
        "background_probe_ratio": None,  # not measured for this model
        "thresholds": thresholds,
        # What the abstain path does to real field photos: how many it refuses,
        # and how accurate the ones it lets through are.
        "field_abstain_rate": float(1 - kept.mean()),
        "field_acc_on_kept": float((field_pred[kept] == field_y[kept]).mean()) if kept.any() else None,
        "n": {"lab": len(test), "field": len(pd), "ood": len(ood_paths)},
        "preprocessing": "resize 224x224, ImageNet normalisation",
    }
    out = ROOT / "docs" / "eval_metrics.json"
    out.write_text(json.dumps(metrics, indent=2) + "\n")

    print(f"\nlab {lab_acc:.2%}  field {field_acc:.2%}  gap {lab_acc - field_acc:.2%}  ECE {ece:.4f}")
    print(f"abstain: msp >= {thresholds['msp_threshold']:.3f}, entropy <= "
          f"{thresholds['entropy_threshold']:.3f}; OOD rejected "
          f"{thresholds['ood_rejection_rate']:.1%}, lab abstained {thresholds['in_dist_abstain_rate']:.1%}")
    print(f"field photos abstained {metrics['field_abstain_rate']:.1%}")
    print(f"wrote {out}")

    # Cross-check against the benchmark suite, when it is checked out locally.
    import csv
    bench = ROOT / "eval"
    if (bench / "results.csv").exists() and (bench / "results_plantdoc.csv").exists():
        lab_ref = next(r for r in csv.DictReader(open(bench / "results.csv"))
                       if r["architecture"] == "EfficientNet-B0")["overall_accuracy"]
        field_ref = next(r for r in csv.DictReader(open(bench / "results_plantdoc.csv"))
                         if r["regime"] == "unrestricted" and r["model"] == "CropScan")["accuracy"]
        print(f"benchmark suite: lab {lab_ref}%  field {field_ref}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
