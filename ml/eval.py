"""Evaluation. Emits docs/eval_report.md.

This file is the point of the rebuild. It reports the lab number and the field
number side by side and states the gap as a headline, because publishing the gap
is the honest thing and hiding it is what the old README did.

Six required outputs (PRD 9):
  1. accuracy + macro-F1 on test_lab AND test_field, with the domain gap
  2. per-class F1, worst 10 called out
  3. confusion matrix (field)
  4. calibration: reliability diagram + ECE
  5. background-bias probe -- score with the leaf masked out
  6. abstain-rate curve

    python ml/eval.py --checkpoint ml/runs/<run>/best.pt
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import timm
import torch
from sklearn.metrics import confusion_matrix, f1_score
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset import LeafDataset, eval_transform, load_labels, mask_leaf_transform
from ood import abstain_curve, expected_calibration_error, tune_thresholds


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"],
                                       text=True).strip()
    except Exception:
        return "unknown"


@torch.no_grad()
def collect_logits(model, loader, device) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    logits, targets = [], []
    for x, y in tqdm(loader, desc="infer", leave=False):
        logits.append(model(x.to(device)).float().cpu().numpy())
        targets.append(y.numpy())
    return np.concatenate(logits), np.concatenate(targets)


def load_model(checkpoint: Path, device):
    ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
    model = timm.create_model(ckpt["model_name"], pretrained=False,
                              num_classes=len(ckpt["labels"]))
    model.load_state_dict(ckpt["state_dict"])
    return model.to(device).eval(), ckpt


def split_loader(manifest, labels, transform, root, batch, workers):
    ds = LeafDataset(manifest, labels, transform, root)
    return DataLoader(ds, batch_size=batch, shuffle=False, num_workers=workers)


def metrics_for(logits, targets) -> dict:
    preds = logits.argmax(1)
    return {
        "n": int(len(targets)),
        "accuracy": float((preds == targets).mean()),
        "macro_f1": float(f1_score(targets, preds, average="macro", zero_division=0)),
    }


def plot_reliability(table, ece, out: Path) -> None:
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], "--", color="#888", label="perfect calibration")
    if table:
        ax.plot([b["confidence"] for b in table], [b["accuracy"] for b in table],
                "o-", color="#7a1f1f", label="model")
    ax.set_xlabel("confidence")
    ax.set_ylabel("accuracy")
    ax.set_title(f"Reliability (field)  ECE = {ece:.4f}")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(out, dpi=140)
    plt.close(fig)


def plot_confusion(cm, labels, out: Path) -> None:
    fig, ax = plt.subplots(figsize=(max(9, len(labels) * 0.32),) * 2)
    norm = cm / np.maximum(cm.sum(axis=1, keepdims=True), 1)
    ax.imshow(norm, cmap="magma_r", vmin=0, vmax=1)
    ax.set_xticks(range(len(labels)), labels, rotation=90, fontsize=6)
    ax.set_yticks(range(len(labels)), labels, fontsize=6)
    ax.set_title("Confusion matrix, row-normalised (test_field)")
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def plot_abstain(curve, out: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot([c["coverage"] for c in curve], [c["accuracy_on_kept"] for c in curve],
            color="#1f5c3a")
    ax.set_xlabel("coverage (fraction answered)")
    ax.set_ylabel("accuracy on answered")
    ax.set_title("Abstain trade-off (field)")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out, dpi=140)
    plt.close(fig)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--manifests", type=Path, default=Path("data/manifests"))
    ap.add_argument("--root", type=Path, default=Path("."))
    ap.add_argument("--rejection-set", type=Path, default=Path("data/raw/rejection"),
                    help="Non-leaf photos, blurred leaves, hands, soil. Any layout.")
    ap.add_argument("--report", type=Path, default=Path("docs/eval_report.md"))
    ap.add_argument("--figures", type=Path, default=Path("docs/figures"))
    ap.add_argument("--size", type=int, default=224)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    args.figures.mkdir(parents=True, exist_ok=True)

    labels = load_labels(args.manifests)
    model, ckpt = load_model(args.checkpoint, device)
    tf = eval_transform(args.size)

    results = {}
    for split in ("test_lab", "test_field"):
        loader = split_loader(args.manifests / f"{split}.csv", labels, tf,
                              args.root, args.batch, args.workers)
        logits, targets = collect_logits(model, loader, device)
        results[split] = {"logits": logits, "targets": targets, **metrics_for(logits, targets)}

    lab, field = results["test_lab"], results["test_field"]
    gap = lab["accuracy"] - field["accuracy"]

    # Per-class F1 on field. Field is what matters; lab per-class is noise.
    f_preds = field["logits"].argmax(1)
    per_class = f1_score(field["targets"], f_preds, average=None,
                         labels=range(len(labels)), zero_division=0)
    support = np.bincount(field["targets"], minlength=len(labels))
    present = [i for i in range(len(labels)) if support[i] > 0]
    worst = sorted(present, key=lambda i: per_class[i])[:10]

    cm = confusion_matrix(field["targets"], f_preds, labels=range(len(labels)))
    plot_confusion(cm, labels, args.figures / "confusion_field.png")

    correct = (f_preds == field["targets"]).astype(float)
    ece, bins = expected_calibration_error(field["logits"], correct)
    plot_reliability(bins, ece, args.figures / "reliability_field.png")

    curve = abstain_curve(field["logits"], correct)
    plot_abstain(curve, args.figures / "abstain_field.png")

    # --- Background-bias probe ------------------------------------------------
    # Score test_field with the leaf masked out. Chance is 1/num_classes. A model
    # meaningfully above chance here is reading background, not lesions.
    probe_loader = split_loader(args.manifests / "test_field.csv", labels,
                                mask_leaf_transform(args.size), args.root,
                                args.batch, args.workers)
    probe_logits, probe_targets = collect_logits(model, probe_loader, device)
    probe_acc = float((probe_logits.argmax(1) == probe_targets).mean())
    chance = 1.0 / len(labels)
    probe_ratio = probe_acc / chance

    # --- Abstain thresholds ---------------------------------------------------
    thresholds = None
    rejection_images = (
        sorted(p for p in args.rejection_set.rglob("*")
               if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
        if args.rejection_set.is_dir() else []
    )
    if rejection_images:
        import csv as _csv
        tmp = args.figures / "_rejection_manifest.csv"
        with tmp.open("w", newline="") as fh:
            w = _csv.DictWriter(fh, fieldnames=["path", "label", "source", "split", "domain"])
            w.writeheader()
            for p in rejection_images:
                w.writerow({"path": str(p), "label": labels[0], "source": "rejection",
                            "split": "ood", "domain": "field"})
        ood_loader = split_loader(tmp, labels, tf, Path("."), args.batch, args.workers)
        ood_logits, _ = collect_logits(model, ood_loader, device)
        thresholds = tune_thresholds(field["logits"], ood_logits)
        tmp.unlink()

    # --- Report ---------------------------------------------------------------
    L = [
        "# Evaluation report",
        "",
        f"Model `{ckpt['model_name']}` · checkpoint `{args.checkpoint}` · "
        f"commit `{git_sha()}` · generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}",
        "",
        "## 1. The headline: lab versus field",
        "",
        "| split | n | accuracy | macro-F1 |",
        "| --- | ---: | ---: | ---: |",
        f"| `test_lab` (PlantVillage-style, controlled) | {lab['n']:,} | "
        f"{lab['accuracy']:.4f} | {lab['macro_f1']:.4f} |",
        f"| **`test_field`** (in-the-wild, never used for selection) | {field['n']:,} | "
        f"**{field['accuracy']:.4f}** | **{field['macro_f1']:.4f}** |",
        "",
        f"### Domain gap: **{gap:+.4f}** ({gap * 100:+.1f} points)",
        "",
        "The field number is the headline. The lab number is context. Reporting the",
        "lab number alone is what makes a 99% crop-disease model useless in an",
        "orchard, and the literature is unambiguous about it: 99.35% collapsing to",
        "31.4% (Ferentinos 2018), 99.72% to 41.81% (Gui et al. 2021).",
        "",
        "## 2. Per-class F1 (field)",
        "",
        "### Worst 10",
        "",
        "| class | F1 | field support |",
        "| --- | ---: | ---: |",
        *(f"| `{labels[i]}` | {per_class[i]:.3f} | {support[i]} |" for i in worst),
        "",
        "<details><summary>All classes</summary>",
        "",
        "| class | F1 | field support |",
        "| --- | ---: | ---: |",
        *(f"| `{labels[i]}` | {per_class[i]:.3f} | {support[i]} |"
          for i in sorted(present, key=lambda i: labels[i])),
        "",
        "</details>",
        "",
    ]
    absent = [labels[i] for i in range(len(labels)) if support[i] == 0]
    if absent:
        L += ["### Classes with no field test images", "",
              "These contribute nothing to the headline number. Stated here rather",
              "than averaged over silently.", ""]
        L += [f"- `{c}`" for c in absent] + [""]

    L += [
        "## 3. Confusion matrix (field)",
        "",
        "![confusion matrix](figures/confusion_field.png)",
        "",
        "## 4. Calibration",
        "",
        f"**ECE = {ece:.4f}** on `test_field`.",
        "",
        "![reliability diagram](figures/reliability_field.png)",
        "",
        "A confident wrong answer is the dangerous failure mode here. A farmer who",
        "is told 'late blight, 97%' sprays for late blight. Calibration is why the",
        "abstain path in section 6 exists.",
        "",
        "## 5. Background-bias probe",
        "",
        "`test_field` scored again with the leaf masked out and only the background",
        "left. A model that reads lesions should be at chance.",
        "",
        "| | value |",
        "| --- | ---: |",
        f"| accuracy on background only | **{probe_acc:.4f}** |",
        f"| chance ({len(labels)} classes) | {chance:.4f} |",
        f"| ratio to chance | **{probe_ratio:.2f}x** |",
        "",
    ]
    if probe_ratio >= 2.0:
        L += [
            f"**The model is reading background.** At {probe_ratio:.2f}x chance with",
            "the leaf removed, a substantial part of the reported accuracy is not",
            "coming from lesions. Say so on `/about`. Fixing it means more aggressive",
            "background replacement in augmentation and more field data, not a",
            "different backbone.",
            "",
        ]
    else:
        L += [
            f"At {probe_ratio:.2f}x chance the model retains little signal without the",
            "leaf. The augmentation policy is doing its job.",
            "",
            "Caveat: the mask is an HSV green-chromaticity threshold, which",
            "under-masks yellowed chlorotic tissue. Under-masking biases this probe",
            "toward looking clean, so a *bad* result is more trustworthy than a good",
            "one.",
            "",
        ]

    L += [
        "## 6. Abstain behaviour",
        "",
        "![abstain curve](figures/abstain_field.png)",
        "",
    ]
    if thresholds:
        L += [
            f"Tuned on {len(rejection_images)} rejection images "
            "(non-leaf photos, blurred leaves, hands, soil).",
            "",
            "| | value |",
            "| --- | ---: |",
            f"| max-softmax threshold | {thresholds['msp_threshold']:.4f} |",
            f"| entropy threshold | {thresholds['entropy_threshold']:.4f} |",
            f"| OOD rejected | {thresholds['ood_rejection_rate']:.1%} |",
            f"| good scans sent to abstain | {thresholds['in_dist_abstain_rate']:.1%} |",
            "",
        ]
        if not thresholds["meets_targets"]:
            L += [f"> {thresholds['note']}", ""]
        L += ["These go into `meta.json`. The API reads them from there; nothing",
              "about the threshold is hardcoded server-side.", ""]
    else:
        L += [
            f"> No rejection set at `{args.rejection_set}`, so thresholds were not tuned.",
            "> The abstain path is required, not optional (PRD 7.3). Collect ~200",
            "> non-leaf photos and re-run before export.",
            "",
        ]

    L += [
        "## Gate 1 summary",
        "",
        "| number | value |",
        "| --- | ---: |",
        f"| lab accuracy | {lab['accuracy']:.4f} |",
        f"| **field accuracy** | **{field['accuracy']:.4f}** |",
        f"| domain gap | {gap:+.4f} |",
        f"| ECE (field) | {ece:.4f} |",
        f"| background probe | {probe_ratio:.2f}x chance |",
        "",
        "If field accuracy is under ~0.70, change the dataset mixture, not the story.",
    ]

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text("\n".join(L) + "\n")

    payload = {
        "lab_acc": lab["accuracy"], "field_acc": field["accuracy"],
        "macro_f1_field": field["macro_f1"], "macro_f1_lab": lab["macro_f1"],
        "domain_gap": gap, "ece": ece,
        "background_probe_acc": probe_acc, "background_probe_ratio": probe_ratio,
        "thresholds": thresholds,
    }
    (args.report.parent / "eval_metrics.json").write_text(json.dumps(payload, indent=2))

    print(json.dumps({k: v for k, v in payload.items() if k != "thresholds"}, indent=2))
    print(f"\nwrote {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
