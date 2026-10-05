"""Measure the licence-safe deploy model and tune its abstain thresholds.

    python scripts/eval_deploy.py [--run deploy-field]

Writes experiments/results/<run>_metrics.json in the shape ml/export.py reads.
Every split comes from experiments/manifest.json, so nothing it trained on is
scored:

    lab     PlantVillage test (4,333)
    field   PlantDoc test (236): the deployable model trained on PlantDoc train
    tune    PlantVillage val + PlantDoc val: what the thresholds must keep.
            Field photos are in-distribution for this model, so they count.
    ood     Imagenette-160 val (3,925): what the thresholds must refuse
    PlantWild test (1,502) is reported for reference only, never used to tune.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "scripts"), str(ROOT / "ml")]
from eval_baseline import imagenette_val, macro_f1  # noqa: E402
from ood import accept, expected_calibration_error, tune_thresholds  # noqa: E402
from train_mixed import EVAL_TF, build_model, load_split  # noqa: E402


@torch.no_grad()
def logits(model, images, batch: int = 64) -> np.ndarray:
    out = []
    for i in range(0, len(images), batch):
        out.append(model(torch.stack([EVAL_TF(im) for im in images[i:i + batch]])).numpy())
    return np.concatenate(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="deploy-field")
    args = ap.parse_args()
    manifest = json.loads((ROOT / "experiments" / "manifest.json").read_text())
    ck = torch.load(ROOT / "experiments" / "cropscan_runs" / args.run / "best.pt", map_location="cpu", weights_only=False)
    model = build_model(len(ck["labels"]))
    model.load_state_dict(ck["state_dict"])
    model.eval()

    cache: dict = {}
    def split(d, s):
        items, _ = load_split(manifest, ROOT / "data" / "raw", d, s, None, cache)
        imgs, y = zip(*items)
        print(f"{d} {s}: {len(y)}", flush=True)
        return logits(model, list(imgs)), np.array(y)

    lab, lab_y = split("plantvillage", "test")
    field, field_y = split("plantdoc", "test")
    pw, pw_y = split("plantwild", "test")
    pv_val, _ = split("plantvillage", "val")
    pd_val, _ = split("plantdoc", "val")
    ood = logits(model, [Image.open(p).convert("RGB") for p in imagenette_val()])

    lab_pred, field_pred, pw_pred = lab.argmax(1), field.argmax(1), pw.argmax(1)
    lab_acc, field_acc = float((lab_pred == lab_y).mean()), float((field_pred == field_y).mean())
    ece, _ = expected_calibration_error(lab, lab_pred == lab_y)
    t = tune_thresholds(np.concatenate([pv_val, pd_val]), ood)

    def kept(lg, y):
        k = accept(lg, t["msp_threshold"], t["entropy_threshold"])
        return {"abstain_rate": float(1 - k.mean()),
                "acc_on_kept": float((lg.argmax(1)[k] == y[k]).mean()) if k.any() else None}

    metrics = {
        "model": f"efficientnet_b0 (torchvision), experiments/cropscan_runs/{args.run}: PlantVillage + PlantDoc only",
        "lab_acc": lab_acc,
        "field_acc": field_acc,
        "macro_f1_field": macro_f1(field_y, field_pred),
        "ece": ece,
        "domain_gap": lab_acc - field_acc,
        "background_probe_ratio": None,
        "thresholds": t,
        "field_abstain": kept(field, field_y),
        "lab_abstain": kept(lab, lab_y),
        "plantwild_reference": {"acc": float((pw_pred == pw_y).mean()), **kept(pw, pw_y)},
        "n": {"lab": len(lab_y), "field": len(field_y), "plantwild": len(pw_y), "ood": len(ood)},
        "preprocessing": "resize 224x224, ImageNet normalisation",
    }
    out = ROOT / "experiments" / "results" / f"{args.run}_metrics.json"
    out.write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
