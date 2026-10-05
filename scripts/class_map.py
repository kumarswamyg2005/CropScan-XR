"""Step 2: map PlantDoc and PlantWild classes onto the 38 PlantVillage classes.

    python scripts/class_map.py   # -> experiments/results/class_map.csv, class_map.md

Status per row:
    exact     same species and same disease (or both the healthy leaf)
    probable  same species; the field label is broader than PlantVillage's
              (e.g. PlantWild "apple rust" vs cedar apple rust). Included in
              evaluation, flagged for review.
    none      no counterpart in the other dataset

Field datasets label healthy plants "<species> leaf"; both card and audit
confirm these are the healthy classes.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "experiments" / "results"
CACHE = ROOT / "experiments" / "cache"

# PlantVillage -> (PlantDoc, PlantWild, status, note)
MAP = {
    "Apple___Apple_scab": ("Apple Scab Leaf", "apple scab", "exact", ""),
    "Apple___Black_rot": (None, "apple black rot", "exact", "PlantDoc has no apple black rot"),
    "Apple___Cedar_apple_rust": ("Apple rust leaf", "apple rust", "probable",
                                 "field labels say 'rust'; cedar-apple is the common one, others possible"),
    "Apple___healthy": ("Apple leaf", "apple leaf", "exact", ""),
    "Blueberry___healthy": ("Blueberry leaf", "blueberry leaf", "exact", ""),
    "Cherry_(including_sour)___Powdery_mildew": (None, "cherry powdery mildew", "exact", ""),
    "Cherry_(including_sour)___healthy": ("Cherry leaf", "cherry leaf", "exact", ""),
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": ("Corn Gray leaf spot", "corn gray leaf spot", "exact", ""),
    "Corn_(maize)___Common_rust_": ("Corn rust leaf", "corn rust", "probable",
                                    "field 'rust' may include southern rust (P. polysora)"),
    "Corn_(maize)___Northern_Leaf_Blight": ("Corn leaf blight", "corn northern leaf blight", "exact",
                                            "PlantDoc says only 'leaf blight'; its images are northern leaf blight"),
    "Corn_(maize)___healthy": (None, "corn leaf", "exact", "PlantDoc has no healthy corn"),
    "Grape___Black_rot": ("grape leaf black rot", "grape black rot", "exact", ""),
    "Grape___Esca_(Black_Measles)": (None, None, "none", ""),
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": (None, None, "none",
                                                   "PlantWild 'grape leaf spot' is unspecific; left unmapped"),
    "Grape___healthy": ("grape leaf", "grape leaf", "exact", ""),
    "Orange___Haunglongbing_(Citrus_greening)": (None, "citrus greening disease", "exact", "PlantWild is all citrus, not only orange"),
    "Peach___Bacterial_spot": (None, None, "none", ""),
    "Peach___healthy": ("Peach leaf", "peach leaf", "exact", ""),
    "Pepper,_bell___Bacterial_spot": ("Bell_pepper leaf spot", "bell pepper leaf spot", "probable",
                                      "field 'leaf spot' is not necessarily bacterial"),
    "Pepper,_bell___healthy": ("Bell_pepper leaf", "bell pepper leaf", "exact", ""),
    "Potato___Early_blight": ("Potato leaf early blight", "potato early blight", "exact", ""),
    "Potato___Late_blight": ("Potato leaf late blight", "potato late blight", "exact", ""),
    "Potato___healthy": (None, "potato leaf", "exact", "PlantDoc has no healthy potato"),
    "Raspberry___healthy": ("Raspberry leaf", "raspberry leaf", "exact", ""),
    "Soybean___healthy": ("Soyabean leaf", "soybean leaf", "exact", ""),
    "Squash___Powdery_mildew": ("Squash Powdery mildew leaf", "squash powdery mildew", "exact", ""),
    "Strawberry___Leaf_scorch": (None, "strawberry leaf scorch", "exact", ""),
    "Strawberry___healthy": ("Strawberry leaf", "strawberry leaf", "exact", ""),
    "Tomato___Bacterial_spot": ("Tomato leaf bacterial spot", "tomato bacterial leaf spot", "exact", ""),
    "Tomato___Early_blight": ("Tomato Early blight leaf", "tomato early blight", "exact", ""),
    "Tomato___Late_blight": ("Tomato leaf late blight", "tomato late blight", "exact", ""),
    "Tomato___Leaf_Mold": ("Tomato mold leaf", "tomato leaf mold", "exact", ""),
    "Tomato___Septoria_leaf_spot": ("Tomato Septoria leaf spot", "tomato septoria leaf spot", "exact", ""),
    "Tomato___Spider_mites Two-spotted_spider_mite": ("Tomato two spotted spider mites leaf", None, "exact",
                                                     "PlantDoc train only; 0 PlantDoc test images"),
    "Tomato___Target_Spot": (None, None, "none", ""),
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": ("Tomato leaf yellow virus", "tomato yellow leaf curl virus", "exact", ""),
    "Tomato___Tomato_mosaic_virus": ("Tomato leaf mosaic virus", "tomato mosaic virus", "probable",
                                     "field 'mosaic virus' on tomato may include TMV/CMV, not only ToMV"),
    "Tomato___healthy": ("Tomato leaf", "tomato leaf", "exact", ""),
}


def main() -> None:
    pv = json.loads((ROOT / "backend" / "class_names.json").read_text())
    assert sorted(MAP) == sorted(pv), set(MAP) ^ set(pv)
    data = {n: json.loads((CACHE / f"{n}.json").read_text()) for n in ("plantvillage", "plantdoc", "plantwild")}
    count = {n: Counter((r["split"], r["label"]) for r in recs) for n, recs in data.items()}
    pd_labels = {r["label"] for r in data["plantdoc"]}
    pw_labels = {r["label"] for r in data["plantwild"]}
    for pv_cls, (pd, pw, _, _) in MAP.items():
        assert pd is None or pd in pd_labels, pd
        assert pw is None or pw in pw_labels, pw

    rows = []
    for pv_cls in pv:
        pd, pw, status, note = MAP[pv_cls]
        rows.append({
            "plantvillage": pv_cls, "plantdoc": pd or "", "plantwild": pw or "", "status": status,
            "pv_images": sum(v for (s, l), v in count["plantvillage"].items() if l == pv_cls),
            "plantdoc_test": count["plantdoc"].get(("test", pd), 0) if pd else 0,
            "plantdoc_train": count["plantdoc"].get(("train", pd), 0) if pd else 0,
            "plantwild_test": count["plantwild"].get(("test", pw), 0) if pw else 0,
            "plantwild_train": count["plantwild"].get(("train", pw), 0) if pw else 0,
            "note": note,
        })
    RESULTS.mkdir(parents=True, exist_ok=True)
    with open(RESULTS / "class_map.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    used_pd = {r["plantdoc"] for r in rows if r["plantdoc"]}
    used_pw = {r["plantwild"] for r in rows if r["plantwild"]}
    unmatched_pd = sorted(pd_labels - used_pd)
    unmatched_pw = sorted(pw_labels - used_pw)
    pw_test_total = sum(v for (s, l), v in count["plantwild"].items() if s == "test")
    pd_test_total = sum(v for (s, l), v in count["plantdoc"].items() if s == "test")
    cov = {
        "plantvillage_classes_mapped_plantdoc": sum(1 for r in rows if r["plantdoc"]),
        "plantvillage_classes_mapped_plantwild": sum(1 for r in rows if r["plantwild"]),
        "plantdoc_test_images_covered": sum(r["plantdoc_test"] for r in rows),
        "plantdoc_test_images_total": pd_test_total,
        "plantwild_test_images_covered": sum(r["plantwild_test"] for r in rows),
        "plantwild_test_images_total": pw_test_total,
        "plantdoc_unmatched": unmatched_pd,
        "plantwild_unmatched": unmatched_pw,
    }
    (RESULTS / "class_map_coverage.json").write_text(json.dumps(cov, indent=2))

    lines = ["# Class map: PlantVillage <-> PlantDoc <-> PlantWild", "",
             "| PlantVillage | PlantDoc | PlantWild | Status | PD test | PW test | Note |",
             "| --- | --- | --- | --- | ---: | ---: | --- |"]
    for r in rows:
        lines.append(f"| {r['plantvillage']} | {r['plantdoc'] or '—'} | {r['plantwild'] or '—'} | {r['status']} | "
                     f"{r['plantdoc_test']} | {r['plantwild_test']} | {r['note']} |")
    lines += ["", "## Coverage", "",
              f"- PlantVillage classes with a PlantDoc counterpart: {cov['plantvillage_classes_mapped_plantdoc']}/38; "
              f"PlantDoc test images covered: {cov['plantdoc_test_images_covered']}/{pd_test_total}",
              f"- PlantVillage classes with a PlantWild counterpart: {cov['plantvillage_classes_mapped_plantwild']}/38; "
              f"PlantWild test images covered: {cov['plantwild_test_images_covered']}/{pw_test_total}",
              f"- PlantDoc classes with no PlantVillage counterpart: {', '.join(unmatched_pd) or 'none'}",
              f"- PlantWild classes with no PlantVillage counterpart ({len(unmatched_pw)}): {', '.join(unmatched_pw)}"]
    (RESULTS / "class_map.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
