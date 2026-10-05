"""Step 4 (B): fine-tune EfficientNet-B0 on lab, field or mixed data.

    python scripts/train_mixed.py --data lab|field|mixed --aug base|field \
        --manifest experiments/manifest.json --data-root <dir with plantwild/ plantdoc/> --out <dir>

Recipe is CropScan's, unchanged: ImageNet-pretrained EfficientNet-B0, Dropout(0.4)
+ Linear head; phase 1 head only, 5 epochs, AdamW 1e-3, cosine; phase 2 all
layers, 15 epochs, AdamW 1e-4 -> 1e-6, cosine. Only data and augmentation vary.

  --data lab    PlantVillage train (capped, see manifest)
  --data field  PlantWild train + PlantDoc train (mapped classes only)
  --data mixed  both
  --aug base    the original notebook's augmentation
  --aug field   RandomResizedCrop, stronger colour jitter, blur, rotation, random erasing

Class imbalance: WeightedRandomSampler with 1/class-count weights.
Model selection: best epoch by val score = mean(PlantVillage val acc, field val acc),
the same rule for every run; test sets are touched once, at the end.
Eval preprocessing: Resize(224, 224) + ImageNet norm, identical to the deployed API.
"""

from __future__ import annotations

import argparse
import copy
import json
import random
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import models, transforms

MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]
CACHE_SIDE = 288  # images are decoded once and kept at this short side
SHORT = {"plantvillage": "PV", "plantwild": "PW", "plantdoc": "PD"}


def seed_all(seed: int) -> None:
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)


def augment(kind: str):
    if kind == "base":  # ml/train.ipynb, verbatim
        return transforms.Compose([
            transforms.Resize((256, 256)), transforms.RandomCrop(224),
            transforms.RandomHorizontalFlip(), transforms.RandomVerticalFlip(), transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),
            transforms.ToTensor(), transforms.Normalize(MEAN, STD)])
    return transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.35, 1.0)),
        transforms.RandomHorizontalFlip(), transforms.RandomVerticalFlip(), transforms.RandomRotation(30),
        transforms.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.4, hue=0.05),
        transforms.RandomApply([transforms.GaussianBlur(5, sigma=(0.1, 2.0))], p=0.3),
        transforms.ToTensor(), transforms.Normalize(MEAN, STD),
        transforms.RandomErasing(p=0.25, scale=(0.02, 0.15))])


EVAL_TF = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor(), transforms.Normalize(MEAN, STD)])


def shrink(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    s = CACHE_SIDE / min(img.size)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.Resampling.BILINEAR) if s < 1 else img


class Images(Dataset):
    def __init__(self, items, tf):
        self.items, self.tf = items, tf  # items: [(PIL image, label)]

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        img, y = self.items[i]
        return self.tf(img), y


def load_split(manifest: dict, root: Path, dataset: str, split: str, limit: int | None, pv_cache: dict):
    rows = manifest[dataset][split][:limit] if limit else manifest[dataset][split]
    if dataset == "plantvillage":
        from datasets import load_dataset
        hf_split = "test" if split == "val" else "train"
        if hf_split not in pv_cache:
            pv_cache[hf_split] = load_dataset(manifest["plantvillage"]["hf_dataset"], split=hf_split)
        ds = pv_cache[hf_split]
        get = lambda r: ds[int(r[0])]["image"]  # noqa: E731
    else:
        base = root / manifest[dataset]["root"]
        get = lambda r: Image.open(base / r[0])  # noqa: E731
    with ThreadPoolExecutor(8) as ex:
        imgs = list(ex.map(lambda r: shrink(get(r)), rows))
    return [(img, int(r[1])) for img, r in zip(imgs, rows)], [r[0] for r in rows]


def build_model(n: int) -> nn.Module:
    m = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
    m.classifier = nn.Sequential(nn.Dropout(p=0.4, inplace=True), nn.Linear(m.classifier[1].in_features, n))
    return m


@torch.no_grad()
def predict(model, items, device, batch=128):
    model.eval()
    out = []
    for i in range(0, len(items), batch):
        x = torch.stack([EVAL_TF(img) for img, _ in items[i:i + batch]]).to(device)
        with torch.autocast(device.type, enabled=device.type == "cuda"):
            out.append(torch.softmax(model(x).float(), 1).cpu().numpy())
    return np.concatenate(out)


def scores(y: np.ndarray, p: np.ndarray) -> dict:
    from sklearn.metrics import f1_score
    allowed = sorted(set(y.tolist()))
    pred, top3 = p.argmax(1), np.argsort(-p, 1)[:, :3]
    rpred = np.array(allowed)[p[:, allowed].argmax(1)]
    return {"n": int(len(y)), "top1": round(float((pred == y).mean() * 100), 2),
            "top3": round(float((top3 == y[:, None]).any(1).mean() * 100), 2),
            "macro_f1": round(float(f1_score(y, pred, labels=allowed, average="macro", zero_division=0)), 4),
            "restricted_top1": round(float((rpred == y).mean() * 100), 2)}


def run_epoch(model, loader, opt, crit, device, scaler):
    model.train()
    total = correct = loss_sum = 0
    for x, y in loader:
        x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
        opt.zero_grad(set_to_none=True)
        with torch.autocast(device.type, enabled=device.type == "cuda"):
            logits = model(x)
            loss = crit(logits, y)
        scaler.scale(loss).backward(); scaler.step(opt); scaler.update()
        loss_sum += loss.item() * len(y); total += len(y); correct += (logits.argmax(1) == y).sum().item()
    return loss_sum / total, correct / total


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", choices=["lab", "field", "mixed"], required=True)
    ap.add_argument("--aug", choices=["base", "field"], required=True)
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--data-root", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--head-epochs", type=int, default=5)
    ap.add_argument("--full-epochs", type=int, default=15)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=None, help="per split, for smoke tests")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    seed_all(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    manifest = json.loads(args.manifest.read_text())
    n_classes = len(manifest["classes"])
    name = f"{args.data}-{args.aug}"
    out = args.out / name; out.mkdir(parents=True, exist_ok=True)
    print(f"[{name}] device {device}", flush=True)

    pv_cache: dict = {}
    load = lambda d, s: load_split(manifest, args.data_root, d, s, args.limit, pv_cache)  # noqa: E731
    sources = {"lab": ["plantvillage"], "field": ["plantwild", "plantdoc"],
               "mixed": ["plantvillage", "plantwild", "plantdoc"]}[args.data]
    t0 = time.time()
    train = [it for d in sources for it in load(d, "train")[0]]
    val = {d: load(d, "val")[0] for d in ("plantvillage", "plantwild", "plantdoc")}
    tests = {d: load(d, "test") for d in ("plantvillage", "plantwild", "plantdoc")}
    print(f"[{name}] loaded train {len(train):,} in {time.time() - t0:.0f}s; "
          f"classes in train: {len({y for _, y in train})}", flush=True)

    counts = Counter(y for _, y in train)
    weights = [1.0 / counts[y] for _, y in train]
    g = torch.Generator().manual_seed(args.seed)
    sampler = WeightedRandomSampler(weights, num_samples=len(train), replacement=True, generator=g)
    loader = DataLoader(Images(train, augment(args.aug)), batch_size=args.batch, sampler=sampler,
                        num_workers=args.workers, pin_memory=device.type == "cuda",
                        persistent_workers=args.workers > 0, generator=g)

    def val_score(model):
        acc = {d: float((predict(model, v, device).argmax(1) == np.array([y for _, y in v])).mean())
               for d, v in val.items()}
        field = (acc["plantwild"] * len(val["plantwild"]) + acc["plantdoc"] * len(val["plantdoc"])) / \
                (len(val["plantwild"]) + len(val["plantdoc"]))
        return 0.5 * acc["plantvillage"] + 0.5 * field, acc

    model = build_model(n_classes).to(device)
    crit = nn.CrossEntropyLoss()
    scaler = torch.amp.GradScaler(enabled=device.type == "cuda")
    history, best, best_state = [], -1.0, None
    phases = [("head", args.head_epochs, 1e-3, 0.0), ("full", args.full_epochs, 1e-4, 1e-6)]
    epoch = 0
    for phase, n_ep, lr, eta_min in phases:
        for p in model.features.parameters():
            p.requires_grad = phase == "full"
        opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=lr, weight_decay=1e-4)
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, n_ep), eta_min=eta_min)
        for _ in range(n_ep):
            epoch += 1
            tl, ta = run_epoch(model, loader, opt, crit, device, scaler)
            sched.step()
            vs, vacc = val_score(model)
            history.append({"epoch": epoch, "phase": phase, "train_loss": round(tl, 4), "train_acc": round(ta, 4),
                            "val_score": round(vs, 4), **{f"val_{d}": round(a, 4) for d, a in vacc.items()}})
            mark = ""
            if vs > best:
                best, best_state, mark = vs, copy.deepcopy(model.state_dict()), " *"
            print(f"[{name}] ep {epoch:02d} {phase} loss {tl:.3f} train {ta:.3f} | val {vs:.4f} "
                  + " ".join(f"{SHORT[d]} {a:.3f}" for d, a in vacc.items()) + mark, flush=True)

    model.load_state_dict(best_state)
    result = {"run": name, "data": args.data, "aug": args.aug, "seed": args.seed, "train_images": len(train),
              "best_val_score": round(best, 4), "history": history, "test": {}}
    probs = {}
    for d, (items, ids) in tests.items():
        p = predict(model, items, device)
        y = np.array([yy for _, yy in items])
        result["test"][d] = scores(y, p)
        probs[d] = p.astype(np.float16)
        probs[f"{d}_ids"] = np.array([str(i) for i in ids])
        probs[f"{d}_y"] = y
    (out / "result.json").write_text(json.dumps(result, indent=2))
    np.savez_compressed(out / "test_probs.npz", **probs)
    torch.save({"model_name": "tv_efficientnet_b0", "state_dict": model.state_dict(),
                "labels": manifest["classes"], "run": name}, out / "best.pt")
    print(f"[{name}] TEST " + " | ".join(f"{d} {r['top1']}% (F1 {r['macro_f1']})" for d, r in result["test"].items()),
          flush=True)


if __name__ == "__main__":
    main()
