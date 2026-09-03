# ADR 0002 — The API runs ONNX Runtime, never PyTorch

**Status:** accepted · **Date:** 2026-09-03

## Context

The previous build imported torch in the FastAPI service and loaded a
`model.pt` through a four-path fallback loader. That made the API image roughly
a gigabyte, coupled the server to the training stack, and meant the loader could
silently fall through to random weights.

## Decision

`ml/` produces exactly three artefacts and the API consumes only those:

```
model.onnx     opset 17, fp32, dynamic batch, simplified
labels.json    ordered canonical class ids
meta.json      input size, normalization, thresholds, metrics, git sha
```

`services/api/requirements.txt` contains `onnxruntime` and no torch. `ml/` is
never imported by the API and never imports it.

**Nothing about the model is hardcoded server-side.** Input size, normalization
constants, the confidence threshold and the entropy threshold are all read from
`meta.json` at startup. Changing the model does not change the server.

## The Grad-CAM problem, and the way round it

The API has to return a Grad-CAM overlay — the XR module uses it as a texture —
but ONNX Runtime has no backward pass, so classic Grad-CAM is unavailable at
serve time.

It turns out not to be needed. For any network ending in global average pooling
followed by a linear classifier, the Grad-CAM weight for class *c* and channel
*k* reduces exactly to the classifier weight `W[c, k]`; the gradient term cancels
against the pooling. So the CAM is a plain weighted sum of the final feature map,
computable in one forward pass.

`ml/export.py` bakes that sum into the exported graph as a second output. For 38
classes at 7×7 that is about 7 KB per image.

## Consequences

- The API image is small and has no CUDA or torch surface.
- The equivalence is **exact only for GAP + linear heads** — true of
  `convnext_tiny`, `efficientnetv2_s` and `efficientnet_b0`, which is every
  backbone in scope. Export refuses to run against any other head shape rather
  than shipping a plausible-looking wrong heatmap.
- Export also refuses to run without tuned abstain thresholds in
  `eval_metrics.json`, so an unmeasured model cannot get behind the API.
- ONNX/PyTorch output parity is asserted at export time and again in
  `ml/tests/test_export_contract.py`.
