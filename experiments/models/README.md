# Trained models (research only)

`mixed-field.pt` — EfficientNet-B0 trained on PlantVillage (capped) + PlantWild + PlantDoc with field
augmentation; the best run of the Step 4 grid. PlantVillage 97.92%, PlantWild 68.44%, PlantDoc 71.61%.

**Not for the live site.** It is trained on PlantWild (CC-BY-NC-ND 4.0), so it stays a research
artefact. The site keeps serving `services/api/model/`.

Checkpoint keys: `model_name`, `state_dict`, `labels` (38 PlantVillage classes), `run`. To serve it,
`ml/export.py --checkpoint experiments/models/mixed-field.pt --labels backend/class_names.json --resize-ratio 1.0`
needs a matching `eval_metrics.json` first. `*.result.json` holds every run's training history and test scores.
