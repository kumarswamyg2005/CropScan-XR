"""Two-phase fine-tune. Head first, then the whole network at a lower LR.

Model selection is on val macro-F1. test_field is NEVER touched here -- it is
opened once, by eval.py, after training is finished. Peeking at it turns the
headline number into a lie.

Logs to CSV and matplotlib. No W&B, no MLflow, no tracker (PRD 3).

    python ml/train.py --model convnext_tiny
    python ml/train.py --model efficientnetv2_s
    python ml/train.py --model efficientnet_b0     # the old baseline, for the one comparison
"""

from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import timm
import torch
import torch.nn as nn
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset import LeafDataset, eval_transform, load_labels, train_transform


def build_loaders(args, labels):
    train_ds = LeafDataset(args.manifests / "train.csv", labels,
                           train_transform(args.size), args.root)
    val_ds = LeafDataset(args.manifests / "val.csv", labels,
                         eval_transform(args.size), args.root)
    common = dict(num_workers=args.workers, pin_memory=True, persistent_workers=args.workers > 0)
    return (
        DataLoader(train_ds, batch_size=args.batch, shuffle=True, drop_last=True, **common),
        DataLoader(val_ds, batch_size=args.batch * 2, shuffle=False, **common),
        train_ds,
    )


def run_epoch(model, loader, criterion, device, optimizer=None, scaler=None, desc=""):
    train = optimizer is not None
    model.train(train)
    total_loss, preds, targets = 0.0, [], []

    with torch.set_grad_enabled(train):
        for x, y in tqdm(loader, desc=desc, leave=False):
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            with torch.autocast(device.type, enabled=scaler is not None):
                out = model(x)
                loss = criterion(out, y)
            if train:
                optimizer.zero_grad(set_to_none=True)
                if scaler is not None:
                    scaler.scale(loss).backward()
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    loss.backward()
                    optimizer.step()
            total_loss += loss.item() * y.size(0)
            preds.append(out.argmax(1).cpu())
            targets.append(y.cpu())

    preds = torch.cat(preds).numpy()
    targets = torch.cat(targets).numpy()
    return {
        "loss": total_loss / len(targets),
        "acc": float((preds == targets).mean()),
        "macro_f1": float(f1_score(targets, preds, average="macro", zero_division=0)),
    }


def plot_curves(history: list[dict], out: Path) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    for ax, key, title in zip(axes, ("loss", "acc", "macro_f1"),
                              ("Loss", "Accuracy", "Macro-F1")):
        ax.plot([h["epoch"] for h in history], [h[f"train_{key}"] for h in history], label="train")
        ax.plot([h["epoch"] for h in history], [h[f"val_{key}"] for h in history], label="val")
        ax.set_title(title)
        ax.set_xlabel("epoch")
        ax.grid(alpha=0.3)
        ax.legend()
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="convnext_tiny")
    ap.add_argument("--manifests", type=Path, default=Path("data/manifests"))
    ap.add_argument("--root", type=Path, default=Path("."))
    ap.add_argument("--out", type=Path, default=Path("ml/runs"))
    ap.add_argument("--size", type=int, default=224)
    ap.add_argument("--batch", type=int, default=48)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--head-epochs", type=int, default=3)
    ap.add_argument("--full-epochs", type=int, default=25)
    ap.add_argument("--head-lr", type=float, default=1e-3)
    ap.add_argument("--full-lr", type=float, default=1e-4)
    ap.add_argument("--weight-decay", type=float, default=0.05)
    ap.add_argument("--label-smoothing", type=float, default=0.1)
    ap.add_argument("--patience", type=int, default=6)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available()
                          else "mps" if torch.backends.mps.is_available() else "cpu")
    run_dir = args.out / f"{args.model}-{time.strftime('%Y%m%d-%H%M%S')}"
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"device={device}  run={run_dir}")

    labels = load_labels(args.manifests)
    train_loader, val_loader, train_ds = build_loaders(args, labels)
    print(f"{len(labels)} classes | train {len(train_ds)} | val {len(val_loader.dataset)}")

    model = timm.create_model(args.model, pretrained=True, num_classes=len(labels)).to(device)
    criterion = nn.CrossEntropyLoss(
        weight=train_ds.class_weights().to(device),
        label_smoothing=args.label_smoothing,
    )
    scaler = torch.amp.GradScaler(device.type) if device.type == "cuda" else None

    history: list[dict] = []
    best = {"macro_f1": -1.0, "epoch": -1}
    log_path = run_dir / "history.csv"
    epoch = 0

    # Phase 1 -- head only. Stops the pretrained trunk being wrecked by the
    # large gradients a randomly initialised classifier produces on epoch 1.
    classifier = model.get_classifier()
    for p in model.parameters():
        p.requires_grad = False
    for p in classifier.parameters():
        p.requires_grad = True

    opt = torch.optim.AdamW(classifier.parameters(), lr=args.head_lr,
                            weight_decay=args.weight_decay)
    for _ in range(args.head_epochs):
        epoch += 1
        tr = run_epoch(model, train_loader, criterion, device, opt, scaler, f"head {epoch}")
        va = run_epoch(model, val_loader, criterion, device, desc=f"val {epoch}")
        history.append({"epoch": epoch, "phase": "head",
                        **{f"train_{k}": v for k, v in tr.items()},
                        **{f"val_{k}": v for k, v in va.items()}})
        print(f"[head {epoch}] val macro_f1={va['macro_f1']:.4f} acc={va['acc']:.4f}")

    # Phase 2 -- everything, low LR, cosine to zero.
    for p in model.parameters():
        p.requires_grad = True
    opt = torch.optim.AdamW(model.parameters(), lr=args.full_lr,
                            weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.full_epochs)

    for _ in range(args.full_epochs):
        epoch += 1
        tr = run_epoch(model, train_loader, criterion, device, opt, scaler, f"full {epoch}")
        va = run_epoch(model, val_loader, criterion, device, desc=f"val {epoch}")
        sched.step()
        history.append({"epoch": epoch, "phase": "full",
                        **{f"train_{k}": v for k, v in tr.items()},
                        **{f"val_{k}": v for k, v in va.items()}})
        print(f"[full {epoch}] val macro_f1={va['macro_f1']:.4f} acc={va['acc']:.4f}")

        if va["macro_f1"] > best["macro_f1"]:
            best = {"macro_f1": va["macro_f1"], "acc": va["acc"], "epoch": epoch}
            torch.save({"state_dict": model.state_dict(), "labels": labels,
                        "model_name": args.model, "size": args.size},
                       run_dir / "best.pt")
            print(f"         saved (best so far)")
        elif epoch - best["epoch"] >= args.patience:
            print(f"early stop: no val macro-F1 gain in {args.patience} epochs")
            break

        with log_path.open("w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(history[0].keys()))
            w.writeheader()
            w.writerows(history)
        plot_curves(history, run_dir / "training_curves.png")

    (run_dir / "summary.json").write_text(json.dumps({
        "model_name": args.model, "size": args.size, "num_classes": len(labels),
        "best_val_macro_f1": best["macro_f1"], "best_epoch": best["epoch"],
        "args": {k: str(v) for k, v in vars(args).items()},
    }, indent=2))

    print(f"\nbest val macro-F1 {best['macro_f1']:.4f} at epoch {best['epoch']}")
    print(f"checkpoint: {run_dir / 'best.pt'}")
    print("\nNow run eval.py. test_field has not been touched yet -- keep it that way\n"
          "until you have stopped changing the model.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
