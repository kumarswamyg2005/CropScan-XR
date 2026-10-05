"""Step 4 prep: fix every train/val/test list once, with test twins removed.

    python scripts/make_manifest.py   # -> experiments/manifest.json (small; the Kaggle notebook embeds it)

Splits (seed 42):
  PlantVillage  test  = the benchmark's 4,333 rows of HF "train" (one seeded stream, 10%/class)
                train = up to PV_CAP rows/class from the rest of HF "train"
                val   = up to PV_VAL rows/class from HF "test" (a separate HF split)
  PlantWild     official split, as published; only classes mapped to PlantVillage
  PlantDoc      official test; val = 10% of official train per class; train = the rest

Leakage: any train/val image that is a confirmed duplicate (dHash + 32x32
correlation, see audit.py) of ANY test image, in any dataset, is dropped.
Test sets are never altered.
"""

from __future__ import annotations

import csv
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit  # noqa: E402

ROOT = audit.ROOT
RES = audit.RESULTS
SEED = 42
PV_CAP = 300   # lab images per class in training; field data is ~50-300/class
PV_VAL = 40


def pv_benchmark_test(labels: list[int], n_classes: int) -> list[int]:
    by_class = {i: [] for i in range(n_classes)}
    for idx, lbl in enumerate(labels):
        by_class[lbl].append(idx)
    rng = random.Random(SEED)
    out = []
    for idxs in by_class.values():
        out.extend(rng.sample(idxs, max(1, int(len(idxs) * 0.10))))
    return sorted(out)


def main() -> None:
    classes = json.loads((ROOT / "backend" / "class_names.json").read_text())
    cmap = list(csv.DictReader(open(RES / "class_map.csv")))
    pw_to = {r["plantwild"]: classes.index(r["plantvillage"]) for r in cmap if r["plantwild"]}
    pd_to = {r["plantdoc"]: classes.index(r["plantvillage"]) for r in cmap if r["plantdoc"]}
    cache = {n: json.loads((audit.CACHE / f"{n}.json").read_text()) for n in ("plantvillage", "plantdoc", "plantwild")}

    # --- PlantVillage rows
    pv = cache["plantvillage"]
    pv_train_rows = [r for r in pv if r["split"] == "train"]
    norm = lambda s: "".join(c.lower() for c in s if c.isalnum())  # noqa: E731
    label_idx = {norm(c): i for i, c in enumerate(classes)}
    y_of = lambda r: label_idx[norm(r["label"])]  # noqa: E731
    test_rows = set(pv_benchmark_test([y_of(r) for r in pv_train_rows], len(classes)))
    pv_test = [r for i, r in enumerate(pv_train_rows) if i in test_rows]

    # --- field splits
    pw = [r for r in cache["plantwild"] if r["label"] in pw_to]
    pd = [r for r in cache["plantdoc"] if r["label"] in pd_to]
    rng = random.Random(SEED)
    pd_by_class = defaultdict(list)
    for r in pd:
        if r["split"] == "train":
            pd_by_class[r["label"]].append(r)
    pd_val_ids = set()
    for label, rs in sorted(pd_by_class.items()):
        rs = sorted(rs, key=lambda r: r["id"])
        pd_val_ids.update(r["id"] for r in rng.sample(rs, max(1, round(len(rs) * 0.10))) if len(rs) > 1)

    # --- every test image, every dataset; drop its twins from train/val
    tests = pv_test + [r for r in pw if r["split"] == "test"] + [r for r in pd if r["split"] == "test"]
    test_ids = {r["id"] for r in tests}
    pool = ([r for i, r in enumerate(pv_train_rows) if i not in test_rows]
            + [r for r in pv if r["split"] == "test"]
            + [r for r in pw if r["split"] != "test"] + [r for r in pd if r["split"] != "test"])
    print(f"checking {len(pool):,} train/val candidates against {len(tests):,} test images ...")
    twins = {p[1]["id"] for p in audit.confirmed(audit.near_pairs(tests, pool))} - test_ids
    print(f"dropping {len(twins)} train/val images that duplicate a test image")

    def ok(r):
        return r["id"] not in twins and "error" not in r

    # --- PlantVillage train (capped) and val
    rng = random.Random(SEED)
    pv_train, pv_val = [], []
    by = defaultdict(list)
    for i, r in enumerate(pv_train_rows):
        if i not in test_rows and ok(r):
            by[y_of(r)].append(i)
    for c in sorted(by):
        pv_train += [(i, c) for i in sorted(rng.sample(by[c], min(PV_CAP, len(by[c]))))]
    by = defaultdict(list)
    for r in pv:
        if r["split"] == "test" and ok(r):
            by[y_of(r)].append(int(r["id"].split("/")[1]))
    for c in sorted(by):
        pv_val += [(i, c) for i in sorted(rng.sample(by[c], min(PV_VAL, len(by[c]))))]

    def field(recs, mapping, prefix, split, extra=lambda r: True):
        return [(r["id"][len(prefix):], mapping[r["label"]]) for r in recs
                if r["split"] == split and ok(r) and extra(r)]

    manifest = {
        "classes": classes, "seed": SEED, "pv_cap": PV_CAP,
        "plantvillage": {"hf_dataset": "GVJahnavi/PlantVillage_dataset",
                         "train": pv_train, "val": pv_val,
                         "test": sorted((i, y_of(pv_train_rows[i])) for i in test_rows),
                         "note": "train/test rows index HF split 'train'; val rows index HF split 'test'"},
        "plantwild": {"root": "plantwild/plantwild/images",
                      "train": field(pw, pw_to, "plantwild/", "train"),
                      "val": field(pw, pw_to, "plantwild/", "val"),
                      "test": [(r["id"][len("plantwild/"):], pw_to[r["label"]]) for r in pw if r["split"] == "test"]},
        "plantdoc": {"root": "plantdoc",
                     "train": field(pd, pd_to, "data/raw/plantdoc/", "train", lambda r: r["id"] not in pd_val_ids),
                     "val": field(pd, pd_to, "data/raw/plantdoc/", "train", lambda r: r["id"] in pd_val_ids),
                     "test": [(r["id"][len("data/raw/plantdoc/"):], pd_to[r["label"]]) for r in pd if r["split"] == "test"]},
        "dropped_twins": sorted(twins),
    }
    out = ROOT / "experiments" / "manifest.json"
    out.write_text(json.dumps(manifest))
    for ds in ("plantvillage", "plantwild", "plantdoc"):
        print(f"{ds:13} " + "  ".join(f"{s} {len(manifest[ds][s]):,}" for s in ("train", "val", "test")))
    print(f"wrote {out} ({out.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
