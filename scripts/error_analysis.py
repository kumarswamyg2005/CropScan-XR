"""Step 5: where the best field model still fails, and what it looks at.

    python scripts/error_analysis.py [--run mixed-field]

Outputs in experiments/results/:
  confusions_top10.csv / .png   the 10 most frequent (true -> predicted) errors on
                                both field test sets, three example images each
  gradcam_failures.png          20 field failures with their class-activation map
  per_class_f1_gain.csv         per-class field F1, lab-only vs this run

The CAM is exact for EfficientNet-B0 (global average pool + one linear layer):
the map for class c is sum_k W[c, k] * feature_k, no gradients needed. It is
drawn for the class the model predicted, i.e. what made it choose wrongly.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
import torch.nn as nn  # noqa: E402
from PIL import Image  # noqa: E402
from torchvision import models, transforms  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "experiments" / "results"
RUNS = ROOT / "experiments" / "cropscan_runs"
RAW = ROOT / "data" / "raw"
TF = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(),
                         transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])


def short(c: str) -> str:
    crop, dis = c.split("___")
    return f"{crop.split('_')[0]}: {dis.replace('_', ' ')[:22]}"


def image_path(dataset: str, rel: str) -> Path:
    return RAW / ("plantwild/plantwild/images" if dataset == "plantwild" else "plantdoc") / rel


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="mixed-field")
    args = ap.parse_args()
    random.seed(42)
    classes = json.loads((ROOT / "backend" / "class_names.json").read_text())

    # ---- errors on both field test sets
    z = np.load(RUNS / args.run / "test_probs.npz")
    errs = []  # (dataset, rel path, true, pred, confidence)
    for d in ("plantwild", "plantdoc"):
        p, y, ids = z[d].astype(np.float32), z[f"{d}_y"], z[f"{d}_ids"]
        for pi, yi, idi in zip(p, y, ids):
            if pi.argmax() != yi:
                errs.append((d, str(idi), int(yi), int(pi.argmax()), float(pi.max())))
    pairs = Counter((t, pr) for _, _, t, pr, _ in errs)
    top = pairs.most_common(10)
    with open(RES / "confusions_top10.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["true", "predicted", "count"])
        for (t, pr), n in top:
            w.writerow([classes[t], classes[pr], n])

    fig, axes = plt.subplots(10, 3, figsize=(7.5, 25))
    for row, ((t, pr), n) in enumerate(top):
        ex = [e for e in errs if (e[2], e[3]) == (t, pr)]
        for col in range(3):
            ax = axes[row, col]; ax.axis("off")
            if col < len(ex):
                d, rel, *_ = ex[col]
                ax.imshow(Image.open(image_path(d, rel)).convert("RGB").resize((200, 200)))
        axes[row, 0].set_title(f"{n}x  true {short(classes[t])}\n-> predicted {short(classes[pr])}",
                               fontsize=7, loc="left")
    fig.tight_layout(); fig.savefig(RES / "confusions_top10.png", dpi=90); plt.close(fig)

    # ---- class activation maps on 20 failures
    ck = torch.load(RUNS / args.run / "best.pt", map_location="cpu", weights_only=False)
    net = models.efficientnet_b0(weights=None)
    net.classifier = nn.Sequential(nn.Dropout(0.4), nn.Linear(1280, len(classes)))
    net.load_state_dict(ck["state_dict"]); net.eval()
    W = net.classifier[1].weight.detach()
    sample = random.sample(errs, 20)
    fig, axes = plt.subplots(5, 8, figsize=(16, 11))
    for i, (d, rel, t, pr, conf) in enumerate(sample):
        img = Image.open(image_path(d, rel)).convert("RGB")
        with torch.no_grad():
            feats = net.features(TF(img)[None])[0]                    # [1280, 7, 7]
            cam = torch.einsum("chw,c->hw", feats, W[pr]).clamp(min=0)
        cam = (cam / (cam.max() + 1e-6)).numpy()
        shown = img.resize((224, 224))
        heat = np.asarray(Image.fromarray((cam * 255).astype(np.uint8)).resize((224, 224), Image.Resampling.BICUBIC)) / 255
        a, b = axes[i // 4, (i % 4) * 2], axes[i // 4, (i % 4) * 2 + 1]
        a.imshow(shown); b.imshow(shown); b.imshow(heat, cmap="jet", alpha=0.45)
        a.set_title(f"true {short(classes[t])}", fontsize=6.5, loc="left")
        b.set_title(f"pred {short(classes[pr])} {conf:.0%}", fontsize=6.5, loc="left")
        a.axis("off"); b.axis("off")
    fig.suptitle(f"{args.run}: 20 random field failures — photo and the map for the predicted class", fontsize=10)
    fig.tight_layout(); fig.savefig(RES / "gradcam_failures.png", dpi=85); plt.close(fig)

    # ---- per-class F1, lab-only vs this run
    from sklearn.metrics import f1_score
    zl = np.load(RUNS / "lab-base" / "test_probs.npz")
    rows = []
    for d in ("plantwild", "plantdoc"):
        y = z[f"{d}_y"]; allowed = sorted(set(y.tolist()))
        f_new = f1_score(y, z[d].astype(np.float32).argmax(1), labels=allowed, average=None, zero_division=0)
        f_lab = f1_score(y, zl[d].astype(np.float32).argmax(1), labels=allowed, average=None, zero_division=0)
        for c, a, b in zip(allowed, f_lab, f_new):
            rows.append({"dataset": d, "class": classes[c], "support": int((y == c).sum()),
                         "f1_lab_only": round(float(a), 3), f"f1_{args.run}": round(float(b), 3),
                         "gain": round(float(b - a), 3)})
    with open(RES / "per_class_f1_gain.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)

    print(f"{len(errs)} field errors; top confusions:")
    for (t, pr), n in top:
        print(f"  {n:3}  {classes[t]:45} -> {classes[pr]}")
    worst = sorted((r for r in rows if r["support"] >= 10), key=lambda r: r[f"f1_{args.run}"])[:6]
    print("weakest classes (support >= 10):", ", ".join(f"{r['class']} [{r['dataset'][:5]}] F1 {r[f'f1_{args.run}']}" for r in worst))


if __name__ == "__main__":
    main()
