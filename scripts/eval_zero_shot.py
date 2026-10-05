"""Step 3 (A): zero-shot lab -> field evaluation. Inference only, no training.

    python scripts/eval_zero_shot.py           # all four models, both field test sets

Models (all predict in the canonical 38-class PlantVillage order; checked below):
    b0     backend/model.pt, torchvision EfficientNet-B0      resize 224x224, ImageNet norm
    mnv2   HF Daksh159/plant-disease-mobilenetv2              same as b0
    b4     HF liriope/PlantDiseaseDetection (Keras)           PIL resize 380x380, effnet preprocess_input
    swin   HF A2H0H0R1/swin-tiny-patch4-window7-224-...       its own AutoImageProcessor
These match the benchmark suite's preprocessing exactly.

Eval sets (ground truth through experiments/results/class_map.csv):
    plantwild  official test split, classes with a PlantVillage counterpart
    plantdoc   official GitHub test split (all 236 map)

Variants per set: all mapped images; "clean" = minus test images confirmed as
PlantVillage duplicates in audit.json (the lab models may have trained on them);
"exact" = clean minus the five 'probable' class mappings. Regimes: unrestricted
(argmax over 38) and restricted (argmax over classes present in that test set).

Outputs in experiments/results/: zeroshot.json, zeroshot.csv,
zeroshot_per_class_f1.csv, confusion/<model>_<set>.csv|png,
zeroshot_probs_<set>.npz (per-image 38-way probabilities, for Step 5).
"""

from __future__ import annotations

import csv
import json
import os
import re
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RES = ROOT / "experiments" / "results"
PLANTWILD = RAW / "plantwild" / "plantwild"
CLASSES = json.loads((ROOT / "backend" / "class_names.json").read_text())
IDX = {c: i for i, c in enumerate(CLASSES)}
SEED = 42


def norm(s: str) -> str:
    s = s.replace("_", " ").replace("(", " ").replace(")", " ").replace(",", " ")
    return re.sub(r"\s+", " ", s).strip().lower()


# ----------------------------------------------------------------- eval sets
def eval_sets() -> dict[str, list[dict]]:
    rows = list(csv.DictReader(open(RES / "class_map.csv")))
    pw_map = {r["plantwild"]: r for r in rows if r["plantwild"]}
    pd_map = {r["plantdoc"]: r for r in rows if r["plantdoc"]}
    audit = json.loads((RES / "audit.json").read_text())["overlap"]
    pv_dup = {p["b"] for p in audit["plantvillage~plantwild"]["pairs_list"]}

    classes = dict(l.split(" ", 1) for l in (PLANTWILD / "classes.txt").read_text().splitlines() if l.strip())
    pw = []
    for line in (PLANTWILD / "trainval.txt").read_text().splitlines():
        if not line.strip():
            continue
        path, cid, mode = line.rsplit("=", 2)
        label = classes[cid].strip()
        if mode.strip() == "0" and label in pw_map:
            ident = f"plantwild/{path}"
            pw.append({"id": ident, "path": PLANTWILD / "images" / path, "label": label,
                       "y": IDX[pw_map[label]["plantvillage"]], "status": pw_map[label]["status"],
                       "pv_dup": ident in pv_dup})
    pd = []
    for path in sorted((RAW / "plantdoc" / "test").rglob("*")):
        if path.is_file() and path.parent.name in pd_map:
            r = pd_map[path.parent.name]
            pd.append({"id": str(path.relative_to(ROOT)), "path": path, "label": path.parent.name,
                       "y": IDX[r["plantvillage"]], "status": r["status"], "pv_dup": False})
    return {"plantwild": pw, "plantdoc": pd}


def open_rgb(p: Path) -> Image.Image:
    return Image.open(p).convert("RGB")


# -------------------------------------------------------------------- models
def model_b0_like(kind: str):
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    tf = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(),
                             transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    if kind == "b0":
        m = models.efficientnet_b0(weights=None)
        m.classifier = nn.Sequential(nn.Dropout(p=0.4, inplace=True), nn.Linear(m.classifier[1].in_features, 38))
        path = ROOT / "backend" / "model.pt"
    else:
        from huggingface_hub import hf_hub_download
        m = models.mobilenet_v2(weights=None)
        m.classifier[1] = nn.Sequential(nn.Dropout(p=0.2), nn.Linear(m.classifier[1].in_features, 38))
        path = Path(hf_hub_download("Daksh159/plant-disease-mobilenetv2", "mobilenetv2_plant.pth"))
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    m.load_state_dict(ckpt.get("model_state_dict", ckpt) if isinstance(ckpt, dict) else ckpt)
    m.eval()

    @torch.no_grad()
    def probs(imgs):
        return torch.softmax(m(torch.stack([tf(i) for i in imgs])), 1).numpy()
    params = sum(p.numel() for p in m.parameters())
    return probs, params, path.stat().st_size / 2**20


def model_b4():
    import tf_keras as keras
    import tensorflow as tf
    from huggingface_hub import hf_hub_download
    path = Path(hf_hub_download("liriope/PlantDiseaseDetection", "plant_disease_efficientnetb4.h5"))
    m = keras.models.load_model(path, compile=False)

    def probs(imgs):
        x = np.stack([np.asarray(i.resize((380, 380)), dtype=np.float32) for i in imgs])
        out = np.asarray(m(tf.keras.applications.efficientnet.preprocess_input(x), training=False))
        # Softmax head; guard in case a checkpoint ever ships logits.
        return out if np.allclose(out.sum(1), 1, atol=1e-3) else tf.nn.softmax(out).numpy()
    return probs, m.count_params(), path.stat().st_size / 2**20


def model_swin():
    import torch
    from transformers import AutoImageProcessor, AutoModelForImageClassification
    mid = "A2H0H0R1/swin-tiny-patch4-window7-224-plant-disease-new"
    proc = AutoImageProcessor.from_pretrained(mid)
    m = AutoModelForImageClassification.from_pretrained(mid).eval()
    labels = [m.config.id2label[i] for i in range(len(m.config.id2label))]
    bad = [i for i, (a, b) in enumerate(zip(labels, CLASSES)) if norm(a) != norm(b)]
    assert len(labels) == 38 and not bad, f"Swin label order differs at {bad[:5]}"

    @torch.no_grad()
    def probs(imgs):
        return torch.softmax(m(**proc(images=imgs, return_tensors="pt")).logits, 1).numpy()
    params = sum(p.numel() for p in m.parameters())
    from huggingface_hub import snapshot_download
    size = sum(f.stat().st_size for f in Path(snapshot_download(mid)).rglob("*.safetensors")) / 2**20
    return probs, params, size


MODELS = {
    "b0": ("EfficientNet-B0 (CropScan)", lambda: model_b0_like("b0")),
    "mnv2": ("MobileNetV2", lambda: model_b0_like("mnv2")),
    "b4": ("EfficientNet-B4", model_b4),
    "swin": ("Swin-Tiny", model_swin),
}

# In-domain reference: the benchmark suite's fixed 4,333-image PlantVillage split.
# B0 was re-measured by ml/eval_baseline.py on the identical split (97.07%).
IN_DOMAIN = {"b0": 97.07, "mnv2": 95.82, "b4": 97.21, "swin": 99.86}


# ------------------------------------------------------------------- metrics
def metrics(y: np.ndarray, p: np.ndarray, allowed: list[int]) -> dict:
    from sklearn.metrics import f1_score
    top3 = np.argsort(-p, 1)[:, :3]
    pred = p.argmax(1)
    rp = p[:, allowed].argmax(1)
    rpred = np.array(allowed)[rp]
    return {
        "n": int(len(y)),
        "top1": round(float((pred == y).mean() * 100), 2),
        "top3": round(float((top3 == y[:, None]).any(1).mean() * 100), 2),
        "macro_f1": round(float(f1_score(y, pred, labels=allowed, average="macro", zero_division=0)), 4),
        "restricted_top1": round(float((rpred == y).mean() * 100), 2),
        "restricted_macro_f1": round(float(f1_score(y, rpred, labels=allowed, average="macro", zero_division=0)), 4),
    }


def latency_ms(probs, imgs: list[Image.Image]) -> float:
    for im in imgs[:10]:
        probs([im])
    t = []
    for im in imgs[10:60]:
        t0 = time.perf_counter(); probs([im]); t.append((time.perf_counter() - t0) * 1000)
    return round(float(np.median(t)), 2)


def save_confusion(name: str, y: np.ndarray, pred: np.ndarray, allowed: list[int]) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    out = RES / "confusion"; out.mkdir(exist_ok=True)
    cm = np.zeros((len(allowed), 38), dtype=int)
    row = {c: i for i, c in enumerate(allowed)}
    for t, p in zip(y, pred):
        cm[row[t], p] += 1
    with open(out / f"{name}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["true\\pred"] + CLASSES)
        for c, r in zip(allowed, cm):
            w.writerow([CLASSES[c]] + list(r))
    short = [c.split("___")[0][:6] + ":" + c.split("___")[1][:12] for c in CLASSES]
    fig, ax = plt.subplots(figsize=(14, 9))
    ax.imshow(cm / np.maximum(cm.sum(1, keepdims=True), 1), cmap="Greens", aspect="auto")
    ax.set_xticks(range(38), short, rotation=90, fontsize=6)
    ax.set_yticks(range(len(allowed)), [short[c] for c in allowed], fontsize=6)
    ax.set_xlabel("predicted (38 PlantVillage classes)"); ax.set_ylabel("true")
    ax.set_title(name + " (row-normalised)")
    fig.tight_layout(); fig.savefig(out / f"{name}.png", dpi=110); plt.close(fig)


# ---------------------------------------------------------------------- main
def main() -> None:
    import torch
    torch.manual_seed(SEED); np.random.seed(SEED)
    sets = eval_sets()
    for k, v in sets.items():
        print(f"{k}: {len(v)} images, {sum(r['pv_dup'] for r in v)} PlantVillage duplicates")

    images = {k: [open_rgb(r["path"]) for r in v] for k, v in sets.items()}
    results, per_class, probs_store = [], [], {k: {} for k in sets}
    for key, (label, loader) in MODELS.items():
        probs_fn, params, size_mb = loader()
        lat = latency_ms(probs_fn, images["plantwild"])
        print(f"\n{label}: {params:,} params, {size_mb:.1f} MB, {lat} ms/img")
        for sname, recs in sets.items():
            P = np.concatenate([probs_fn(images[sname][i:i + 32]) for i in range(0, len(recs), 32)])
            probs_store[sname][key] = P.astype(np.float32)
            y = np.array([r["y"] for r in recs])
            masks = {"all": np.ones(len(recs), bool),
                     "clean": np.array([not r["pv_dup"] for r in recs]),
                     "exact": np.array([not r["pv_dup"] and r["status"] == "exact" for r in recs])}
            for variant, m in masks.items():
                allowed = sorted(set(y[m].tolist()))
                met = metrics(y[m], P[m], allowed)
                drop = round(IN_DOMAIN[key] - met["top1"], 2)
                results.append({"model": label, "key": key, "dataset": sname, "variant": variant,
                                "classes": len(allowed), **met, "in_domain_top1": IN_DOMAIN[key],
                                "lab_to_field_drop_pp": drop, "params": params,
                                "size_mb": round(size_mb, 2), "latency_ms_cpu": lat})
                print(f"  {sname:9} {variant:5} n={met['n']:4} top1={met['top1']:6.2f} "
                      f"macroF1={met['macro_f1']:.3f} restricted={met['restricted_top1']:6.2f} drop={drop}")
            allowed = sorted(set(y.tolist()))
            pred = P.argmax(1)
            save_confusion(f"{key}_{sname}", y, pred, allowed)
            from sklearn.metrics import f1_score
            f1s = f1_score(y, pred, labels=allowed, average=None, zero_division=0)
            for c, f in zip(allowed, f1s):
                per_class.append({"model": label, "dataset": sname, "class": CLASSES[c],
                                  "support": int((y == c).sum()), "f1": round(float(f), 4)})

    RES.mkdir(parents=True, exist_ok=True)
    (RES / "zeroshot.json").write_text(json.dumps(results, indent=2))
    with open(RES / "zeroshot.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(results[0])); w.writeheader(); w.writerows(results)
    with open(RES / "zeroshot_per_class_f1.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(per_class[0])); w.writeheader(); w.writerows(per_class)
    for sname, recs in sets.items():
        np.savez_compressed(RES / f"zeroshot_probs_{sname}.npz",
                            ids=np.array([r["id"] for r in recs]), y=np.array([r["y"] for r in recs]),
                            **probs_store[sname])
    print("\nwrote", RES / "zeroshot.csv")


if __name__ == "__main__":
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    main()
