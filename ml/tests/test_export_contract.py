"""The export contract: exactly three files, and meta.json must be complete.

The API reads meta.json for normalization and the abstain thresholds. If a field
goes missing the server has no safe default -- it would either crash at startup
or, worse, silently fall back to a guess. Checked here so it fails at export
time instead.

Skips cleanly when nothing has been exported yet, so it is safe to run on a
fresh clone.
"""

import json
from pathlib import Path

import pytest

MODEL_DIR = Path(__file__).resolve().parents[2] / "services" / "api" / "model"

REQUIRED_META = {
    "model_name", "input_size", "normalization", "layout", "colour_space",
    "trained_at", "git_sha", "num_classes", "metrics",
    "confidence_threshold", "entropy_threshold", "gradcam_layer", "outputs",
}
REQUIRED_METRICS = {"lab_acc", "field_acc", "macro_f1_field", "ece", "domain_gap"}

exported = pytest.mark.skipif(
    not (MODEL_DIR / "meta.json").exists(),
    reason="no export yet -- run ml/export.py",
)


@exported
def test_exactly_three_artefacts():
    names = {p.name for p in MODEL_DIR.iterdir() if p.name != ".gitkeep"}
    assert names == {"model.onnx", "labels.json", "meta.json"}, (
        f"unexpected contents: {sorted(names)}"
    )


@exported
def test_meta_has_every_required_field():
    meta = json.loads((MODEL_DIR / "meta.json").read_text())
    assert REQUIRED_META <= set(meta), f"missing: {sorted(REQUIRED_META - set(meta))}"
    assert REQUIRED_METRICS <= set(meta["metrics"])


@exported
def test_labels_match_meta_count():
    meta = json.loads((MODEL_DIR / "meta.json").read_text())
    labels = json.loads((MODEL_DIR / "labels.json").read_text())
    assert len(labels) == meta["num_classes"]
    assert labels == sorted(labels), "label order must be stable and sorted"
    assert len(set(labels)) == len(labels), "duplicate label"


@exported
def test_thresholds_are_in_range():
    meta = json.loads((MODEL_DIR / "meta.json").read_text())
    assert 0.0 < meta["confidence_threshold"] < 1.0
    assert 0.0 < meta["entropy_threshold"] <= 1.0


@exported
def test_normalization_is_three_channel():
    n = json.loads((MODEL_DIR / "meta.json").read_text())["normalization"]
    assert len(n["mean"]) == 3 and len(n["std"]) == 3
    assert all(s > 0 for s in n["std"])


@exported
def test_onnx_loads_and_has_both_outputs():
    ort = pytest.importorskip("onnxruntime")
    import numpy as np

    meta = json.loads((MODEL_DIR / "meta.json").read_text())
    sess = ort.InferenceSession(str(MODEL_DIR / "model.onnx"),
                                providers=["CPUExecutionProvider"])
    assert [o.name for o in sess.get_outputs()] == ["logits", "cam"]

    size = meta["input_size"]
    logits, cam = sess.run(None, {"input": np.zeros((1, 3, size, size), np.float32)})
    assert logits.shape == (1, meta["num_classes"])
    assert cam.shape[1] == meta["num_classes"]


@exported
def test_fixed_image_gives_a_stable_top1():
    """Smoke test. A re-export that changes this changes what the API says about
    a real photo, so it should be a deliberate act, not a surprise."""
    ort = pytest.importorskip("onnxruntime")
    import numpy as np

    meta = json.loads((MODEL_DIR / "meta.json").read_text())
    fixture = MODEL_DIR.parent / "tests" / "fixtures" / "expected_top1.json"
    if not fixture.exists():
        pytest.skip("no pinned expectation yet; write one after the first export")

    size = meta["input_size"]
    rng = np.random.default_rng(0)
    x = rng.random((1, 3, size, size), dtype=np.float32)
    sess = ort.InferenceSession(str(MODEL_DIR / "model.onnx"),
                                providers=["CPUExecutionProvider"])
    logits, _ = sess.run(None, {"input": x})
    expected = json.loads(fixture.read_text())
    assert int(logits.argmax()) == expected["top1_index"]
