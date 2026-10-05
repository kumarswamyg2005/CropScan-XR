# Lab -> field experiments

Research track: how far does CropScan's PlantVillage model fall on in-the-wild photos, and how much
does training on field data recover? Results: `results/summary.md`. Not part of the paper.

## Data (not committed; `data/raw/` is git-ignored)

| Dataset | Source | License |
| --- | --- | --- |
| PlantVillage | HF `GVJahnavi/PlantVillage_dataset` (train 43,503 + test 10,878) | as published |
| PlantWild v1 | HF `uqtwei2/PlantWild`, `plantwild.zip` -> `data/raw/plantwild/` | CC-BY-NC-ND 4.0 (research only) |
| PlantDoc | GitHub `pratikkayal/PlantDoc-Dataset` -> `data/raw/plantdoc/` | CC-BY 4.0 |

## Commands (paper `.venv`, plus `transformers` for Swin)

```bash
python scripts/audit.py hash plantvillage && python scripts/audit.py hash plantwild && python scripts/audit.py hash plantdoc
python scripts/audit.py report            # results/audit.md
python scripts/class_map.py               # results/class_map.csv
python scripts/eval_zero_shot.py          # results/zeroshot.csv  (Step 3)
python scripts/make_manifest.py           # experiments/manifest.json
python scripts/make_kaggle_notebook.py    # experiments/kaggle_train.ipynb -> run on Kaggle (GPU, Internet on)
#   unzip cropscan_runs.zip into experiments/cropscan_runs/
python scripts/error_analysis.py          # results/confusions_top10.*, gradcam_failures.png (Step 5)
```

## Assumptions, and where the data contradicted the notes

- Baseline in-domain accuracy is 97.07% (benchmark's fixed 4,333 split), not 99.3%.
- PlantDoc (official GitHub): 2,578 images, 28 classes (27 in test); notes said 2,598 / 27.
  6 files differ only by letter case and collide on macOS; recovered as `*__casedup.jpg`.
- PlantWild's split file is `trainval.txt` (readme says `split.txt`); counts match (test 3,677).
- PlantWild's official split leaks: 213 test images have a duplicate in train/val, 167 of those
  pairs carry different labels. Test sets are used as published; the twins were removed from training.
- PlantWild and PlantDoc share 363 images (57 in PlantWild test); 33 PlantVillage lab images sit
  inside PlantWild (6 in test). Some cross-dataset duplicates carry different labels.
- Five class mappings are broader-than-exact (apple rust, corn rust, pepper leaf spot, tomato mosaic,
  PlantDoc corn leaf blight); results are reported with and without them.
- PlantWild contains fruit and whole-plant photos under leaf-disease labels; they count as errors.
- FieldPlant (Roboflow login, detection labels) and iCassava (Kaggle login, no overlapping classes) skipped.
- Training selected on mean(PlantVillage val, field val); PlantDoc val is 10% of its official train.
