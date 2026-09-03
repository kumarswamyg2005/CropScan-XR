"""Build the unified lab+field manifest.

Emits data/manifests/{train,val,test_lab,test_field}.csv with columns
    path, label, source, split, domain

Rules enforced here (PRD 4.1, issues #6):
  * test_field is field images only and is NEVER used for model selection.
  * Splitting is by image GROUP, so near-duplicates cannot straddle splits --
    PlantVillage has heavy intra-class redundancy and a naive random split
    leaks it into val, which is how you get a beautiful val curve and a
    worthless field number.
  * PlantVillage is subsampled to fight the ~43% tomato skew.
  * Per-class training count is capped.
  * Deterministic: same --seed gives byte-identical CSVs (tested in
    ml/tests/test_manifest.py).

Expected layout under --root (images are never committed):
    data/raw/plantvillage/<raw_label>/*.jpg
    data/raw/plantdoc/<split>/<raw_label>/*.jpg
    data/raw/plantwild/<raw_label>/*.jpg
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Which source counts as lab and which as field. This is the whole point of the
# rebuild, so it is data, not a guess made at read time.
DOMAIN_OF_SOURCE = {
    "plantvillage": "lab",
    "plantdoc": "field",
    "plantwild": "field",
}

# PlantVillage filenames repeat a base id across augmented copies, e.g.
#   "0a1b...___JR_FrgE.S 2814.JPG" and "0a1b...___JR_FrgE.S 2814_flipTB.JPG"
# Stripping the trailing augmentation token groups an original with its copies.
_AUG_SUFFIX = re.compile(
    r"_(flip(TB|LR)|rot\d+|newGRR|90deg|180deg|270deg|final|copy)\d*$",
    re.IGNORECASE,
)


def group_key(path: Path) -> str:
    """Stable id shared by an image and its near-duplicates.

    ponytail: filename-stem grouping, no image reads. It catches PlantVillage's
    scripted augmentation, which is the redundancy that actually matters here.
    It does NOT catch burst photos of the same leaf in the field sets. If the
    field number looks suspiciously high, switch to --group-by dhash, which
    reads pixels and is ~40x slower but catches those too.
    """
    return _AUG_SUFFIX.sub("", path.stem)


def dhash_key(path: Path, size: int = 8) -> str:
    """Perceptual group key. Opt-in; needs Pillow and reads every image."""
    from PIL import Image

    with Image.open(path) as im:
        im = im.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
        px = list(im.getdata())
    bits = [
        px[r * (size + 1) + c] > px[r * (size + 1) + c + 1]
        for r in range(size)
        for c in range(size)
    ]
    return hashlib.sha1(bytes(bits)).hexdigest()[:16]


def load_taxonomy(path: Path) -> dict:
    tax = yaml.safe_load(path.read_text())
    canonical = tax["canonical"]
    for source, mapping in tax["sources"].items():
        if mapping == "identity":
            continue
        for raw, target in (mapping or {}).items():
            if target not in canonical:
                raise SystemExit(
                    f"taxonomy.yaml: {source}/{raw!r} maps to {target!r}, "
                    f"which is not a canonical id"
                )
    return tax


def resolve(tax: dict, source: str, raw_label: str) -> str | None:
    """Canonical id, or None if this label is deliberately excluded."""
    excluded = (tax.get("exclude") or {}).get(source) or {}
    if raw_label in excluded:
        return None
    mapping = tax["sources"].get(source)
    if mapping == "identity":
        if raw_label in tax["canonical"]:
            return raw_label
    elif mapping and raw_label in mapping:
        return mapping[raw_label]
    if "*" in excluded:
        return None
    raise KeyError(raw_label)


def scan(root: Path, tax: dict) -> tuple[list[dict], dict[str, set[str]]]:
    """Walk the raw dataset directories. Returns (rows, unmapped-by-source)."""
    rows: list[dict] = []
    unmapped: dict[str, set[str]] = defaultdict(set)

    for source in DOMAIN_OF_SOURCE:
        src_dir = root / source
        if not src_dir.is_dir():
            print(f"  ! {src_dir} missing, skipping {source}", file=sys.stderr)
            continue

        # Label dir is the last directory that contains images, so both
        # <source>/<label>/ and <source>/<split>/<label>/ layouts work.
        for label_dir in sorted(p for p in src_dir.rglob("*") if p.is_dir()):
            images = sorted(
                p for p in label_dir.iterdir()
                if p.suffix.lower() in IMAGE_SUFFIXES
            )
            if not images:
                continue
            raw_label = label_dir.name
            try:
                canonical = resolve(tax, source, raw_label)
            except KeyError:
                unmapped[source].add(raw_label)
                continue
            if canonical is None:
                continue
            for img in images:
                rows.append({
                    "path": str(img.relative_to(root.parent.parent)),
                    "label": canonical,
                    "source": source,
                    "domain": DOMAIN_OF_SOURCE[source],
                    "_abs": img,
                })
    return rows, unmapped


def assign_splits(rows: list[dict], args, keyfn) -> list[dict]:
    """Group-aware split. A group lands wholly in one split or none."""
    rng = random.Random(args.seed)

    # group id -> rows. Group within (source, label) so identical stems across
    # different classes never merge.
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["source"], r["label"], keyfn(r["_abs"]))].append(r)

    by_class: dict[tuple, list[list[dict]]] = defaultdict(list)
    for (source, label, _), members in groups.items():
        by_class[(label, DOMAIN_OF_SOURCE[source])].append(members)

    out: list[dict] = []
    for (label, domain), grps in sorted(by_class.items()):
        grps.sort(key=lambda g: g[0]["path"])   # deterministic before shuffle
        rng.shuffle(grps)
        n = len(grps)

        if domain == "field":
            # Field images are scarce and carry the headline metric. Reserve the
            # test slice first, then val, then everything else trains.
            n_test = max(1, round(n * args.field_test_frac))
            n_val = max(1, round(n * args.val_frac)) if n - n_test > 1 else 0
            slices = [("test_field", grps[:n_test]),
                      ("val", grps[n_test:n_test + n_val]),
                      ("train", grps[n_test + n_val:])]
        else:
            n_test = max(1, round(n * args.lab_test_frac))
            n_val = max(1, round(n * args.val_frac)) if n - n_test > 1 else 0
            slices = [("test_lab", grps[:n_test]),
                      ("val", grps[n_test:n_test + n_val]),
                      ("train", grps[n_test + n_val:])]

        for split, chunk in slices:
            for members in chunk:
                for r in members:
                    out.append({**r, "split": split})
    return out


def rebalance(rows: list[dict], args) -> list[dict]:
    """Subsample lab training data and cap per-class training count.

    Two separate jobs, both only ever touching `train`:
      1. PlantVillage is 54k of mostly-lab images and ~43% tomato. Left alone it
         dominates and the model learns backgrounds.
      2. Even after that, a per-class cap keeps the long tail from vanishing.
    """
    rng = random.Random(args.seed + 1)
    train = [r for r in rows if r["split"] == "train"]
    rest = [r for r in rows if r["split"] != "train"]

    kept: list[dict] = []
    per_class: dict[str, list[dict]] = defaultdict(list)
    for r in train:
        per_class[r["label"]].append(r)

    for label, items in sorted(per_class.items()):
        lab = [r for r in items if r["domain"] == "lab"]
        field = [r for r in items if r["domain"] == "field"]

        # Field is the scarce, valuable half -- never subsample it. Cap lab so
        # the mixture lands near the validated ~1/3 lab, ~2/3 field ratio.
        #
        # The floor is a TOP-UP to a minimum per-class training size, not an
        # unconditional lab minimum. Written the other way round (a flat "keep
        # at least N lab images per class") it silently defeats the ratio for
        # every class with modest field coverage, which is most of them, and
        # the train set comes out lab-heavy -- the exact failure this rebuild
        # exists to fix.
        target_lab = min(len(lab), args.lab_per_class_cap)
        if field:
            ratio_cap = round(len(field) * args.lab_to_field_ratio)
            topup = max(0, args.min_train_per_class - len(field))
            target_lab = min(target_lab, max(ratio_cap, topup))

        lab.sort(key=lambda r: r["path"])
        rng.shuffle(lab)
        chosen = lab[:target_lab] + field

        chosen.sort(key=lambda r: r["path"])
        if len(chosen) > args.class_cap:
            rng.shuffle(chosen)
            chosen = chosen[: args.class_cap]
        kept.extend(chosen)

    return rest + kept


def write_manifests(rows: list[dict], out_dir: Path) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {}
    for split in ("train", "val", "test_lab", "test_field"):
        subset = sorted(
            (r for r in rows if r["split"] == split),
            key=lambda r: (r["label"], r["path"]),
        )
        target = out_dir / f"{split}.csv"
        with target.open("w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["path", "label", "source", "split", "domain"])
            w.writeheader()
            for r in subset:
                w.writerow({k: r[k] for k in w.fieldnames})
        counts[split] = len(subset)
    return counts


def write_dataset_card(rows: list[dict], counts: dict[str, int], args, path: Path) -> None:
    train = [r for r in rows if r["split"] == "train"]
    dom = Counter(r["domain"] for r in train)
    total = sum(dom.values()) or 1
    per_class = Counter(r["label"] for r in train)
    field_test = Counter(r["label"] for r in rows if r["split"] == "test_field")

    lines = [
        "# Dataset card",
        "",
        f"Generated by `ml/data/build_manifest.py --seed {args.seed}`. Regenerate rather than edit.",
        "",
        "## Split sizes",
        "",
        "| split | images |",
        "| --- | ---: |",
        *(f"| {k} | {v:,} |" for k, v in counts.items()),
        "",
        "## Train mixture",
        "",
        f"- lab: **{dom['lab']:,}** ({dom['lab'] / total:.1%})",
        f"- field: **{dom['field']:,}** ({dom['field'] / total:.1%})",
        "",
        "Target is roughly one third lab, two thirds field -- the mixture the prior",
        "art validates (PRD 4.1). A lab-heavy mixture is what produces a 99% number",
        "that collapses in a real orchard.",
        "",
        "## Per-class training distribution",
        "",
        "| class | train | test_field |",
        "| --- | ---: | ---: |",
        *(
            f"| `{label}` | {n:,} | {field_test.get(label, 0):,} |"
            for label, n in sorted(per_class.items())
        ),
        "",
        "## Classes with no field test images",
        "",
    ]
    missing = sorted(set(per_class) - set(field_test))
    lines += (
        [f"- `{c}`" for c in missing]
        if missing
        else ["None -- every trained class has field test coverage."]
    )
    if missing:
        lines += [
            "",
            "These classes cannot contribute to the headline field number. Say so in",
            "the eval report rather than averaging over them silently.",
        ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", type=Path, default=Path("data/raw"))
    ap.add_argument("--taxonomy", type=Path, default=Path("data/taxonomy.yaml"))
    ap.add_argument("--out", type=Path, default=Path("data/manifests"))
    ap.add_argument("--card", type=Path, default=Path("docs/dataset_card.md"))
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--group-by", choices=["stem", "dhash"], default="stem")
    ap.add_argument("--val-frac", type=float, default=0.10)
    ap.add_argument("--lab-test-frac", type=float, default=0.10)
    ap.add_argument("--field-test-frac", type=float, default=0.25,
                    help="Field test slice. Generous on purpose: this is the headline metric.")
    ap.add_argument("--lab-per-class-cap", type=int, default=400)
    ap.add_argument("--min-train-per-class", type=int, default=60,
                    help="Small classes are topped up with lab images to this "
                         "training size. Tops up; never overrides the ratio for "
                         "classes that already have field coverage.")
    ap.add_argument("--lab-to-field-ratio", type=float, default=0.5,
                    help="Lab images kept per field image, per class. 0.5 -> ~1/3 lab overall.")
    ap.add_argument("--class-cap", type=int, default=1200)
    ap.add_argument("--report-unmapped", action="store_true",
                    help="List raw labels with no taxonomy entry, then exit.")
    args = ap.parse_args()

    tax = load_taxonomy(args.taxonomy)
    rows, unmapped = scan(args.root, tax)

    if args.report_unmapped:
        if not unmapped:
            print("No unmapped labels. taxonomy.yaml covers everything on disk.")
            return 0
        for source, labels in sorted(unmapped.items()):
            print(f"\n# {source} -- paste under sources.{source} in data/taxonomy.yaml")
            for label in sorted(labels):
                print(f'    "{label}": ')
        return 0

    if unmapped:
        for source, labels in sorted(unmapped.items()):
            print(f"unmapped in {source}: {sorted(labels)}", file=sys.stderr)
        raise SystemExit(
            "Refusing to build a manifest with unmapped labels. A silently dropped\n"
            "class is a hole in the eval you will not notice until the field numbers\n"
            "look wrong. Run with --report-unmapped and fill in data/taxonomy.yaml."
        )
    if not rows:
        raise SystemExit(f"No images found under {args.root}. Download the datasets first.")

    keyfn = dhash_key if args.group_by == "dhash" else group_key
    rows = assign_splits(rows, args, keyfn)
    rows = rebalance(rows, args)
    counts = write_manifests(rows, args.out)
    write_dataset_card(rows, counts, args, args.card)

    for split, n in counts.items():
        print(f"{split:12s} {n:>7,}")
    print(f"\nwrote {args.out}/ and {args.card}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
