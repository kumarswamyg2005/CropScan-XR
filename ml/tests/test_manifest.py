"""Manifest guarantees. These are the ones that quietly break the eval if wrong."""

import csv
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
BUILDER = REPO / "ml" / "data" / "build_manifest.py"

# Two crops is enough to exercise grouping, capping and the domain split.
FIXTURE = {
    "plantvillage": {
        "Apple___Apple_scab": 40,
        "Apple___healthy": 40,
        "Tomato___Early_blight": 90,   # stands in for the tomato skew
        "Tomato___healthy": 90,
    },
    "plantdoc": {
        "Apple Scab Leaf": 60,
        "Apple leaf": 60,
        "Tomato Early blight leaf": 60,
        "Tomato leaf": 60,
    },
}


def build_tree(root: Path) -> None:
    for source, labels in FIXTURE.items():
        for label, n in labels.items():
            d = root / source / label
            d.mkdir(parents=True)
            for i in range(n):
                # Every third image is an augmented copy of its predecessor, so
                # group-aware splitting has something real to hold together.
                stem = f"{label.replace(' ', '_')}_{i // 3:03d}"
                suffix = ["", "_flipLR", "_rot90"][i % 3]
                (d / f"{stem}{suffix}.jpg").write_bytes(b"")


def run_builder(tmp_path: Path, seed: int = 1337) -> dict[str, list[dict]]:
    raw = tmp_path / "data" / "raw"
    raw.mkdir(parents=True)
    build_tree(raw)

    out = tmp_path / "manifests"
    proc = subprocess.run(
        [sys.executable, str(BUILDER),
         "--root", str(raw),
         "--taxonomy", str(REPO / "data" / "taxonomy.yaml"),
         "--out", str(out),
         "--card", str(tmp_path / "dataset_card.md"),
         "--seed", str(seed)],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    return {
        p.stem: list(csv.DictReader(p.open()))
        for p in sorted(out.glob("*.csv"))
    }


def test_same_seed_is_byte_identical(tmp_path):
    """Deterministic seed. Without this, no eval number is reproducible."""
    a = run_builder(tmp_path / "a")
    b = run_builder(tmp_path / "b")
    assert a == b


def test_different_seed_changes_the_split(tmp_path):
    a = run_builder(tmp_path / "a", seed=1337)
    b = run_builder(tmp_path / "b", seed=99)
    assert a != b, "seed is being ignored somewhere"


def test_test_field_is_field_only(tmp_path):
    """The headline metric must not be contaminated with lab images."""
    m = run_builder(tmp_path)
    assert m["test_field"], "no field test images produced"
    assert {r["domain"] for r in m["test_field"]} == {"field"}
    assert {r["source"] for r in m["test_field"]} == {"plantdoc"}


def test_test_lab_is_lab_only(tmp_path):
    m = run_builder(tmp_path)
    assert {r["domain"] for r in m["test_lab"]} == {"lab"}


def test_no_image_appears_in_two_splits(tmp_path):
    m = run_builder(tmp_path)
    seen: dict[str, str] = {}
    for split, rows in m.items():
        for r in rows:
            assert r["path"] not in seen, (
                f"{r['path']} is in both {seen[r['path']]} and {split}"
            )
            seen[r["path"]] = split


def test_augmented_copies_never_straddle_splits(tmp_path):
    """PlantVillage's scripted augmentation is the leak that flatters val."""
    m = run_builder(tmp_path)
    group_split: dict[str, str] = {}
    for split, rows in m.items():
        for r in rows:
            stem = Path(r["path"]).stem
            base = stem.replace("_flipLR", "").replace("_rot90", "")
            key = f"{r['label']}::{base}"
            if key in group_split:
                assert group_split[key] == split, (
                    f"group {key} straddles {group_split[key]} and {split}"
                )
            group_split[key] = split


def test_train_mixture_is_field_leaning(tmp_path):
    """PRD 4.1: roughly one third lab. A lab-heavy train set is the whole bug
    we are rebuilding to fix, so assert the direction, not a precise ratio."""
    m = run_builder(tmp_path)
    train = m["train"]
    field = sum(r["domain"] == "field" for r in train)
    assert field / len(train) > 0.5, (
        f"train is only {field / len(train):.0%} field; lab subsampling is not working"
    )


def test_labels_are_canonical(tmp_path):
    tax = yaml.safe_load((REPO / "data" / "taxonomy.yaml").read_text())
    m = run_builder(tmp_path)
    for rows in m.values():
        for r in rows:
            assert r["label"] in tax["canonical"], r["label"]


def test_unmapped_label_fails_loudly(tmp_path):
    """A silently dropped class is a hole in the eval nobody notices."""
    raw = tmp_path / "data" / "raw"
    raw.mkdir(parents=True)
    build_tree(raw)
    rogue = raw / "plantdoc" / "Kiwi mystery blight"
    rogue.mkdir(parents=True)
    (rogue / "a.jpg").write_bytes(b"")

    proc = subprocess.run(
        [sys.executable, str(BUILDER),
         "--root", str(raw),
         "--taxonomy", str(REPO / "data" / "taxonomy.yaml"),
         "--out", str(tmp_path / "m"),
         "--card", str(tmp_path / "card.md")],
        capture_output=True, text=True,
    )
    assert proc.returncode != 0
    assert "Kiwi mystery blight" in proc.stderr


def test_report_unmapped_lists_them(tmp_path):
    raw = tmp_path / "data" / "raw"
    raw.mkdir(parents=True)
    build_tree(raw)
    rogue = raw / "plantdoc" / "Kiwi mystery blight"
    rogue.mkdir(parents=True)
    (rogue / "a.jpg").write_bytes(b"")

    proc = subprocess.run(
        [sys.executable, str(BUILDER), "--root", str(raw),
         "--taxonomy", str(REPO / "data" / "taxonomy.yaml"),
         "--report-unmapped"],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0
    assert "Kiwi mystery blight" in proc.stdout


def test_taxonomy_targets_all_canonical():
    tax = yaml.safe_load((REPO / "data" / "taxonomy.yaml").read_text())
    for source, mapping in tax["sources"].items():
        if mapping == "identity":
            continue
        for raw, target in (mapping or {}).items():
            assert target in tax["canonical"], f"{source}/{raw} -> {target}"
