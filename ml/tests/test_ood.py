"""Abstain logic. Pure numpy, so this runs without a GPU or a checkpoint.

This is the safety path: below threshold the API returns no disease_id and the
XR module refuses to launch. If it breaks, the system confidently narrates a
pathogen life cycle for a photo of someone's hand.
"""

import numpy as np
import pytest

from ood import (
    abstain_curve,
    accept,
    expected_calibration_error,
    scores,
    softmax,
    tune_thresholds,
)

RNG = np.random.default_rng(0)


def confident(n, classes=38, peak=12.0):
    """Logits with one clear winner -- a good scan."""
    x = RNG.normal(0, 0.5, (n, classes))
    x[np.arange(n), RNG.integers(0, classes, n)] += peak
    return x


def junk(n, classes=38):
    """Flat logits -- what a photo of soil or a hand looks like."""
    return RNG.normal(0, 0.5, (n, classes))


def test_softmax_rows_sum_to_one():
    p = softmax(junk(50))
    assert np.allclose(p.sum(axis=1), 1.0)


def test_softmax_is_shift_invariant():
    """Guards the max-subtraction. Without it, large logits overflow to nan."""
    x = junk(20)
    assert np.allclose(softmax(x), softmax(x + 500.0))
    assert np.isfinite(softmax(x + 1e4)).all()


def test_confident_scores_higher_than_junk():
    c_msp, c_ent = scores(confident(200))
    j_msp, j_ent = scores(junk(200))
    assert c_msp.mean() > j_msp.mean()
    assert c_ent.mean() < j_ent.mean()


def test_entropy_is_normalised_to_unit_range():
    """Normalising by log(n_classes) is what stops the threshold moving when a
    class is added to the taxonomy."""
    for classes in (10, 38, 101):
        _, ent = scores(junk(200, classes))
        assert 0.0 <= ent.min() and ent.max() <= 1.0
    _, flat_ent = scores(np.zeros((1, 38)))
    assert flat_ent[0] == pytest.approx(1.0)


def test_accept_needs_both_conditions():
    """High softmax with a messy tail must still be refused."""
    logits = np.zeros((1, 38))
    logits[0, 0] = 3.0            # top class wins, rest is broad
    msp, ent = scores(logits)
    assert accept(logits, msp[0] - 0.01, 1.0)[0]           # msp alone passes
    assert not accept(logits, msp[0] - 0.01, ent[0] - 0.01)[0]  # entropy vetoes


def test_tune_thresholds_rejects_junk():
    t = tune_thresholds(confident(400), junk(400))
    assert t["meets_targets"], t.get("note")
    assert t["ood_rejection_rate"] >= 0.90
    assert t["in_dist_abstain_rate"] <= 0.10


def test_tune_thresholds_prioritises_rejection_when_impossible():
    """If the junk is indistinguishable, reject anyway and say so. Sending a
    farmer a confident wrong diagnosis costs more than asking for a retake."""
    same = confident(300)
    t = tune_thresholds(same, confident(300))
    assert not t["meets_targets"]
    assert "note" in t


def test_tuned_thresholds_are_usable_by_accept():
    in_d, out_d = confident(300), junk(300)
    t = tune_thresholds(in_d, out_d)
    kept_ood = accept(out_d, t["msp_threshold"], t["entropy_threshold"]).mean()
    assert 1 - kept_ood == pytest.approx(t["ood_rejection_rate"], abs=1e-9)


def test_abstain_curve_trades_coverage_for_accuracy():
    logits = np.concatenate([confident(300), junk(300)])
    preds = logits.argmax(1)
    truth = np.concatenate([confident(300).argmax(1), junk(300).argmax(1)])
    correct = (preds == truth).astype(float)
    curve = abstain_curve(logits, correct)
    assert curve
    assert curve[0]["coverage"] >= curve[-1]["coverage"]
    for c in curve:
        assert 0.0 <= c["coverage"] <= 1.0
        assert c["abstain_rate"] == pytest.approx(1 - c["coverage"])


def test_ece_is_zero_for_a_perfectly_calibrated_model():
    """Confidence 1.0 and always right -> no calibration error."""
    logits = confident(500, peak=40.0)
    correct = np.ones(500)
    ece, table = expected_calibration_error(logits, correct)
    assert ece < 0.01
    assert table


def test_ece_catches_confident_wrongness():
    """The failure mode that matters: sure, and wrong."""
    logits = confident(500, peak=40.0)
    ece, _ = expected_calibration_error(logits, np.zeros(500))
    assert ece > 0.9
