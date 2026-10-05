# Lab -> field experiments: summary

## Step 3 — zero-shot (no training)

In-domain = the benchmark's fixed 4,333-image PlantVillage split. Field sets are the official
test splits, restricted to classes that map onto PlantVillage (`class_map.md`). *Clean* removes
test images confirmed as PlantVillage duplicates. Drop = in-domain top-1 minus clean field top-1.

| Model | Params | Size MB | CPU ms/img* | In-domain top-1 | PlantWild top-1 (clean, n=1,496) | PW macro-F1 | PW drop (pp) | PlantDoc top-1 (n=236) | PD macro-F1 | PD drop (pp) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| EfficientNet-B0 (CropScan) | 4.1M | 15.74 | 111.49 | 97.07 | 12.37 | 0.1232 | **84.7** | 14.83 | 0.1633 | **82.24** |
| MobileNetV2 | 2.3M | 8.91 | 28.48 | 95.82 | 13.64 | 0.115 | **82.18** | 17.8 | 0.1363 | **78.02** |
| EfficientNet-B4 | 18.1M | 93.49 | 195.33 | 97.21 | 18.32 | 0.1787 | **78.89** | 25.85 | 0.2263 | **71.36** |
| Swin-Tiny | 27.5M | 105.34 | 40.4 | 99.86 | 20.99 | 0.2127 | **78.87** | 32.63 | 0.2886 | **67.23** |

\*Latency is batch-1 CPU on a machine that was running other jobs; compare models with each other, not with the paper's figures.

Variants (top-1): all / clean / exact-classes-only, and restricted (argmax over present classes):

| Model | PW all | PW clean | PW exact | PW restricted | PD all | PD exact | PD restricted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| EfficientNet-B0 (CropScan) | 12.72 | 12.37 | 12.79 | 12.5 | 14.83 | 14.72 | 20.34 |
| MobileNetV2 | 13.91 | 13.64 | 14.97 | 13.9 | 17.8 | 19.8 | 22.46 |
| EfficientNet-B4 | 18.58 | 18.32 | 19.19 | 18.72 | 25.85 | 27.92 | 27.97 |
| Swin-Tiny | 21.24 | 20.99 | 21.52 | 21.59 | 32.63 | 35.03 | 35.59 |

Observations:

- Every model loses 65-85 points; the ~99%->30-50% literature range is if anything optimistic for these field sets.
- Ranking survives domain shift here: Swin > B4 > MobileNetV2 ~ B0 on both field sets, as in the paper's PlantDoc result.
- B0 collapses: 36% of all PlantWild predictions are 'Strawberry Leaf_scorch'; 43% of its wrong answers carry >90% confidence.
- Sanity: B0 on the official PlantDoc test split (14.83%) matches the paper's full-PlantDoc figure (14.67%).
- Removing the 6 PlantVillage duplicates changes PlantWild accuracy by <0.4 pp; contamination is not driving these numbers.

## Step 4 — fine-tuning EfficientNet-B0 on lab / field / mixed data

Same recipe as CropScan (5 head + 15 full epochs, seed 42); only data and augmentation vary.
Kaggle GPU; model selected on validation only; test sets touched once. 244 training images that
duplicate any test image were removed. 38 output classes; field data covers 33 of them.

| Run | Train imgs | PlantVillage top-1 | PlantWild top-1 | PW macro-F1 | PlantDoc top-1 | PD macro-F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| lab-base | 11,010 | 97.35 | 14.78 | 0.1391 | 20.76 | 0.2025 |
| lab-field | 11,010 | 98.27 | 19.71 | 0.1888 | 29.66 | 0.2861 |
| field-base | 7,267 | 45.17 | 66.38 | 0.6567 | 65.25 | 0.6544 |
| field-field | 7,267 | 45.88 | 67.31 | 0.6605 | 66.53 | 0.6569 |
| mixed-base | 18,277 | 97.18 | 68.31 | 0.6711 | 72.03 | 0.7268 |
| mixed-field | 18,277 | 97.92 | 68.44 | 0.6727 | 71.61 | 0.7184 |

**Mixed-training gain** (mixed-field vs lab-base = the original recipe on lab data): PlantWild +53.7 pp, PlantDoc +50.8 pp, PlantVillage +0.6 pp.

- Field data is what closes the gap; augmentation alone does not. Field augmentation lifts the lab-only model by +4.9 (PW) / +8.9 (PD) pp but changes the mixed model by <0.5 pp.
- Field-only training forgets the lab domain (PlantVillage 45%); mixed keeps it (97-98%).
- Verified: scores recomputed from saved per-image probabilities match; an independent local re-run of mixed-field on the PlantWild test gives 68.04% (Kaggle 68.44%; the gap is Kaggle's extra pre-shrink step).
- PlantWild is CC-BY-NC-ND: the field-* and mixed-* models are research-only and are not deployed.

## Step 5 — error analysis (mixed-field)

541 errors over 1,738 field test images. Top confusions (`confusions_top10.csv/.png`) are all same-crop look-alikes:
corn gray leaf spot -> northern leaf blight (24), early -> late blight on potato (12) and tomato (12), tomato mosaic ->
yellow leaf curl (12), septoria <-> bacterial spot (12 + 11).

Class-activation maps on 20 random failures (`gradcam_failures.png`): the model attends to plant tissue in ~18/20.
Failure types: (1) not a leaf photo, ~7/20 (whole peppers, apple fruit, whole bushes labelled with leaf classes);
(2) right lesion, wrong disease, ~6/20; (3) label noise from web scraping (stock watermarks, cross-labelled duplicates).
Weakest classes (F1, support >= 10): cherry powdery mildew 0.38, tomato mosaic virus 0.39, tomato septoria 0.43,
bell pepper bacterial spot 0.44. Per-class gains: `per_class_f1_gain.csv`.
