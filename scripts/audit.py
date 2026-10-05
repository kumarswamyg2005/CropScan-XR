"""Step 1: audit every dataset, then look for the same photo across datasets.

    python scripts/audit.py hash plantvillage    # one dataset -> experiments/cache/<name>.json
    python scripts/audit.py report               # all cached -> experiments/results/audit.{md,json}

Per image: split, label, size, md5 (exact duplicates) and a 64-bit dHash
(near-duplicates: resized, recompressed or lightly cropped copies). Cross-
dataset near-duplicates are found by splitting each hash into four 16-bit
bands: two hashes within Hamming distance 3 must share at least one band,
so only bucket-mates are compared, never all pairs.

Sources:
    plantvillage  HF GVJahnavi/PlantVillage_dataset (the copy the benchmark used)
    plantdoc      data/raw/plantdoc/{train,test}/<class>/  (official GitHub repo)
    plantwild     data/raw/plantwild/...                   (HF uqtwei2/PlantWild, v1)
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "experiments" / "cache"
RESULTS = ROOT / "experiments" / "results"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
NEAR = 3  # Hamming distance counted as "same photo"


def dhash(img: Image.Image) -> int:
    """64-bit difference hash on a 9x8 grayscale thumbnail."""
    a = np.asarray(img.convert("L").resize((9, 8), Image.Resampling.BILINEAR), dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def record(split: str, label: str, ident: str, raw: bytes) -> dict:
    rec = {"split": split, "label": label, "id": ident, "md5": hashlib.md5(raw).hexdigest()}
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
        rec.update(w=img.width, h=img.height, dhash=format(dhash(img), "016x"))
    except Exception as exc:  # corrupt or unreadable
        rec["error"] = type(exc).__name__
    return rec


def iter_plantvillage():
    """Both HF splits: train (43,503; the benchmark drew its 4,333 test images
    from this one) and test (10,878). Ids are "<split>/<row>"."""
    from datasets import Image as HFImage, load_dataset
    for split in ("train", "test"):
        ds = load_dataset("GVJahnavi/PlantVillage_dataset", split=split)
        names = ds.features["label"].names
        ds = ds.cast_column("image", HFImage(decode=False))
        for i, row in enumerate(ds):
            raw = row["image"]["bytes"] or Path(row["image"]["path"]).read_bytes()
            yield record(split, names[row["label"]], f"{split}/{i}", raw)


def iter_folder(root: Path):
    """<root>/<split>/<class>/<image>, or <root>/<class>/<image> (split 'all')."""
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() not in IMAGE_EXT or not path.is_file():
            continue
        parts = path.relative_to(root).parts
        if len(parts) < 2:  # repo files such as PlantDoc_Examples.png, not dataset images
            continue
        split, label = (parts[0], parts[1]) if len(parts) >= 3 else ("all", parts[0])
        yield record(split, label, str(path.relative_to(ROOT)), path.read_bytes())


PLANTWILD = RAW / "plantwild" / "plantwild"
PLANTWILD_MODE = {"0": "test", "1": "train", "2": "val"}


def plantwild_split() -> list[tuple[str, str, str]]:
    """(relative image path, class name, split) from the official split file.
    The readme calls it split.txt; the v1 zip ships it as trainval.txt.
    Lines are <path>=<class_id>=<mode>, and paths contain spaces."""
    classes = dict(line.split(" ", 1) for line in (PLANTWILD / "classes.txt").read_text().splitlines() if line.strip())
    rows = []
    for line in (PLANTWILD / "trainval.txt").read_text().splitlines():
        if line.strip():
            path, cid, mode = line.rsplit("=", 2)
            rows.append((path, classes[cid].strip(), PLANTWILD_MODE[mode.strip()]))
    return rows


def iter_plantwild():
    for path, label, split in plantwild_split():
        yield record(split, label, f"plantwild/{path}", (PLANTWILD / "images" / path).read_bytes())


SOURCES = {
    "plantvillage": iter_plantvillage,
    "plantdoc": lambda: iter_folder(RAW / "plantdoc"),
    "plantwild": lambda: iter_plantwild(),
}


def cmd_hash(name: str) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    recs = []
    for n, rec in enumerate(SOURCES[name](), 1):
        recs.append(rec)
        if n % 5000 == 0:
            print(f"{name}: {n}", flush=True)
    (CACHE / f"{name}.json").write_text(json.dumps(recs))
    print(f"{name}: {len(recs)} images hashed")


def summarise(name: str, recs: list[dict]) -> dict:
    ok = [r for r in recs if "error" not in r]
    md5 = Counter(r["md5"] for r in recs)
    dh = Counter(r["dhash"] for r in ok)
    w = np.array([r["w"] for r in ok]); h = np.array([r["h"] for r in ok])
    per_class = Counter(r["label"] for r in recs)
    per_split = Counter(r["split"] for r in recs)
    return {
        "dataset": name,
        "images": len(recs),
        "corrupt": len(recs) - len(ok),
        "splits": dict(per_split),
        "classes": len(per_class),
        "per_class": dict(sorted(per_class.items())),
        "smallest_class": min(per_class.values()),
        "largest_class": max(per_class.values()),
        "exact_duplicate_copies": sum(c - 1 for c in md5.values() if c > 1),
        "same_dhash_copies": sum(c - 1 for c in dh.values() if c > 1),
        "width_px": {q: int(np.percentile(w, p)) for q, p in (("p5", 5), ("median", 50), ("p95", 95))},
        "height_px": {q: int(np.percentile(h, p)) for q, p in (("p5", 5), ("median", 50), ("p95", 95))},
    }


def informative(r: dict) -> bool:
    """A near-blank image hashes to almost all 0s or 1s and would "match" every
    other blank image; such hashes say nothing about identity."""
    return "dhash" in r and 6 <= bin(int(r["dhash"], 16)).count("1") <= 58


def near_pairs(a: list[dict], b: list[dict]) -> list[tuple[dict, dict, int]]:
    """Image pairs (one from a, one from b) whose dHashes are within NEAR bits."""
    bands = defaultdict(list)
    for r in b:
        if informative(r):
            v = int(r["dhash"], 16)
            for k in range(4):
                bands[(k, (v >> (16 * k)) & 0xFFFF)].append((v, r))
    found, seen = [], set()
    for r in a:
        if not informative(r):
            continue
        v = int(r["dhash"], 16)
        for k in range(4):
            for u, s in bands.get((k, (v >> (16 * k)) & 0xFFFF), ()):
                d = bin(u ^ v).count("1")
                key = (r["id"], s["id"])
                if d <= NEAR and key not in seen:
                    seen.add(key)
                    found.append((r, s, d))
    return found


_PV = {}


def load_image(rec: dict) -> Image.Image:
    """Re-open an audited image from its id (PlantVillage ids are "<split>/<row>")."""
    ident = rec["id"]
    if ident.startswith(("train/", "test/")) and "/" in ident and ident.split("/")[1].isdigit():
        from datasets import load_dataset
        split, row = ident.split("/")
        if split not in _PV:
            _PV[split] = load_dataset("GVJahnavi/PlantVillage_dataset", split=split)
        return _PV[split][int(row)]["image"]
    if ident.startswith("plantwild/"):
        return Image.open(PLANTWILD / "images" / ident[len("plantwild/"):])
    return Image.open(ROOT / ident)


def thumb(img: Image.Image) -> np.ndarray:
    a = np.asarray(img.convert("L").resize((32, 32), Image.Resampling.BILINEAR), dtype=np.float32).ravel()
    a -= a.mean()
    return a / (np.linalg.norm(a) + 1e-6)


CONFIRM = 0.90  # pixel correlation of 32x32 thumbnails for a hash match to count


def confirmed(pairs: list[tuple[dict, dict, int]]) -> list[tuple[dict, dict, int, float]]:
    """dHash bands propose; thumbnail correlation decides. Flat, uniform-background
    images (all of PlantVillage) collide on a 9x8 hash without being the same photo."""
    out = []
    for a, b, d in pairs:
        try:
            r = float(thumb(load_image(a)) @ thumb(load_image(b)))
        except Exception:
            continue
        if r >= CONFIRM:
            out.append((a, b, d, r))
    return out


def cmd_report() -> None:
    data = {p.stem: json.loads(p.read_text()) for p in sorted(CACHE.glob("*.json"))}
    summary = {n: summarise(n, r) for n, r in data.items()}
    names = list(data)
    overlap = {}
    for i, x in enumerate(names):
        for y in names[i + 1:]:
            candidates = near_pairs(data[x], data[y])
            pairs = confirmed(candidates)
            overlap[f"{x}~{y}"] = {
                "hash_candidates": len(candidates),
                "pairs": len(pairs),
                f"{y}_test_images": len({p[1]["id"] for p in pairs if p[1]["split"] == "test"}),
                f"{x}_test_images": len({p[0]["id"] for p in pairs if p[0]["split"] == "test"}),
                f"{x}_images": len({p[0]["id"] for p in pairs}),
                f"{y}_images": len({p[1]["id"] for p in pairs}),
                "pairs_list": [{"a": p[0]["id"], "a_split": p[0]["split"], "a_label": p[0]["label"],
                                "b": p[1]["id"], "b_split": p[1]["split"], "b_label": p[1]["label"],
                                "hamming": p[2], "corr": round(p[3], 3)} for p in pairs],
            }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "audit.json").write_text(json.dumps({"datasets": summary, "overlap": overlap}, indent=2))

    lines = ["# Data audit", "",
             "| Dataset | Images | Splits | Classes | Smallest / largest class | Corrupt | Exact dup copies | Same-dHash copies | Width p5/med/p95 | Height p5/med/p95 |",
             "| --- | ---: | --- | ---: | --- | ---: | ---: | ---: | --- | --- |"]
    for s in summary.values():
        sp = ", ".join(f"{k} {v}" for k, v in s["splits"].items())
        wd, ht = s["width_px"], s["height_px"]
        lines.append(f"| {s['dataset']} | {s['images']:,} | {sp} | {s['classes']} | "
                     f"{s['smallest_class']} / {s['largest_class']} | {s['corrupt']} | "
                     f"{s['exact_duplicate_copies']} | {s['same_dhash_copies']} | "
                     f"{wd['p5']}/{wd['median']}/{wd['p95']} | {ht['p5']}/{ht['median']}/{ht['p95']} |")
    lines += ["", f"## Cross-dataset duplicates (dHash Hamming <= {NEAR}, confirmed by 32x32 correlation >= {CONFIRM})", "",
              "| Pair | Hash candidates | Confirmed pairs | Images involved (each side) | Of which in a TEST split (each side) |",
              "| --- | ---: | ---: | --- | --- |"]
    for k, v in overlap.items():
        x, y = k.split("~")
        lines.append(f"| {x} vs {y} | {v['hash_candidates']} | {v['pairs']} | {v[x + '_images']} / {v[y + '_images']} | "
                     f"{v[x + '_test_images']} / {v[y + '_test_images']} |")
    lines += ["", "Per-class counts are in `audit.json`."]
    (RESULTS / "audit.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    if sys.argv[1] == "hash":
        cmd_hash(sys.argv[2])
    else:
        cmd_report()
