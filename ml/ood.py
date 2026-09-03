"""Abstain / out-of-distribution scoring.

Required, not optional (PRD 7.3). The XR module tells a causal story about a
specific pathogen. Telling that story about a photo of a hand, a wall, or a
blurred smear is the worst thing this system can do -- worse than saying nothing,
because it is confidently, legibly wrong about someone's crop.

Two scores, combined:
    max-softmax   how sure the top class is
    entropy       how spread the rest of the distribution is

A softmax can be high while the distribution is broad and messy; entropy catches
that. Both must pass for the prediction to stand.
"""

from __future__ import annotations

import numpy as np


def softmax(logits: np.ndarray) -> np.ndarray:
    z = logits - logits.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def scores(logits: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Returns (max_softmax, normalised_entropy). Entropy is scaled to [0, 1]
    by log(num_classes) so the threshold does not move when classes are added."""
    p = softmax(logits)
    msp = p.max(axis=1)
    ent = -(p * np.log(p + 1e-12)).sum(axis=1) / np.log(p.shape[1])
    return msp, ent


def accept(logits: np.ndarray, msp_threshold: float, entropy_threshold: float) -> np.ndarray:
    msp, ent = scores(logits)
    return (msp >= msp_threshold) & (ent <= entropy_threshold)


def tune_thresholds(
    in_dist_logits: np.ndarray,
    ood_logits: np.ndarray,
    target_ood_rejection: float = 0.90,
    max_in_dist_loss: float = 0.10,
) -> dict:
    """Pick thresholds on a rejection set.

    The rejection set is non-leaf photos, blurred leaves, hands, soil -- what a
    farmer actually points a phone at by accident.

    Objective, in priority order:
      1. reject at least `target_ood_rejection` of the junk
      2. subject to that, keep in-distribution loss under `max_in_dist_loss`
      3. subject to both, keep as many good scans as possible

    If (1) and (2) cannot both hold, (1) wins and the shortfall is reported.
    Sending a farmer a confident wrong diagnosis costs more than asking for a
    second photo.
    """
    in_msp, in_ent = scores(in_dist_logits)
    ood_msp, ood_ent = scores(ood_logits)

    best = None
    for msp_t in np.quantile(in_msp, np.linspace(0.0, 0.5, 51)):
        for ent_t in np.quantile(in_ent, np.linspace(0.5, 1.0, 51)):
            kept_in = float(((in_msp >= msp_t) & (in_ent <= ent_t)).mean())
            kept_ood = float(((ood_msp >= msp_t) & (ood_ent <= ent_t)).mean())
            rejection = 1.0 - kept_ood
            loss = 1.0 - kept_in
            candidate = {
                "msp_threshold": float(msp_t),
                "entropy_threshold": float(ent_t),
                "ood_rejection_rate": rejection,
                "in_dist_abstain_rate": loss,
            }
            ok = rejection >= target_ood_rejection and loss <= max_in_dist_loss
            key = (ok, rejection if not ok else kept_in)
            if best is None or key > best[0]:
                best = (key, candidate, ok)

    _, chosen, met = best
    chosen["meets_targets"] = met
    if not met:
        chosen["note"] = (
            f"Could not reach {target_ood_rejection:.0%} OOD rejection while keeping "
            f"in-distribution abstain under {max_in_dist_loss:.0%}. Rejection was "
            f"prioritised. Either the model is poorly calibrated or the rejection "
            f"set is too close to the training distribution."
        )
    return chosen


def abstain_curve(logits: np.ndarray, correct: np.ndarray, points: int = 40) -> list[dict]:
    """Accuracy of what is kept, as the confidence bar rises.

    This is the plot that answers 'if we only answer when we are sure, how sure
    are we?' -- and it is the argument for having an abstain path at all.
    """
    msp, _ = scores(logits)
    out = []
    for t in np.linspace(msp.min(), msp.max(), points):
        keep = msp >= t
        if keep.sum() == 0:
            continue
        out.append({
            "threshold": float(t),
            "coverage": float(keep.mean()),
            "accuracy_on_kept": float(correct[keep].mean()),
            "abstain_rate": float(1 - keep.mean()),
        })
    return out


def expected_calibration_error(
    logits: np.ndarray, correct: np.ndarray, bins: int = 15
) -> tuple[float, list[dict]]:
    """ECE plus the reliability bins.

    A confident wrong answer is the dangerous failure mode for a farmer, so this
    number goes in the report next to accuracy, not in an appendix.
    """
    conf, _ = scores(logits)
    edges = np.linspace(0.0, 1.0, bins + 1)
    ece, table = 0.0, []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.sum() == 0:
            continue
        acc = float(correct[m].mean())
        avg_conf = float(conf[m].mean())
        ece += (m.mean()) * abs(acc - avg_conf)
        table.append({"bin_lo": float(lo), "bin_hi": float(hi), "count": int(m.sum()),
                      "accuracy": acc, "confidence": avg_conf})
    return float(ece), table
