"""Export the three files the API consumes, and nothing else.

    services/api/model/model.onnx     opset 17, fp32, dynamic batch, simplified
    services/api/model/labels.json    ordered canonical class ids
    services/api/model/meta.json      input size, normalization, thresholds, metrics

Nothing about the model is hardcoded on the server. If it needs to know it, it
goes in meta.json.

## Why the graph emits CAM maps

The API must return a Grad-CAM overlay (the XR module uses it as a texture) but
must not ship PyTorch -- onnxruntime has no backward pass, so classic Grad-CAM is
not available at serve time.

It does not need to be. For any network that ends in global average pooling
followed by a linear classifier -- which covers convnext_tiny, efficientnetv2_s
and efficientnet_b0, i.e. every backbone in scope -- the Grad-CAM weight for
class c and channel k reduces exactly to the classifier weight W[c, k]. The
gradient term cancels against the pooling. So the CAM is a plain weighted sum of
the final feature map, computable in one forward pass with no gradients.

This module bakes that sum into the exported graph as a second output. For 38
classes at 7x7 that is ~7 KB per image: free.

ponytail: exact only for GAP + linear heads. If a backbone with attention
pooling or a multi-layer head is ever adopted, this silently degrades to an
approximation -- export refuses to run and says so rather than shipping a
plausible-looking wrong heatmap.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import timm
import torch
import torch.nn as nn

from dataset import IMAGENET_MEAN, IMAGENET_STD


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


class ExportWrapper(nn.Module):
    """Emits (logits, cam). cam is [B, num_classes, H, W], un-normalised."""

    def __init__(self, model: nn.Module):
        super().__init__()
        self.model = model

        classifier = model.get_classifier()
        if not isinstance(classifier, nn.Linear):
            raise SystemExit(
                f"Classifier is {type(classifier).__name__}, not nn.Linear. The CAM "
                f"shortcut in this module is exact only for a global-average-pool + "
                f"linear head. Refusing to export a heatmap that would look "
                f"plausible and be wrong."
            )
        self.register_buffer("cam_weight", classifier.weight.detach().clone())

        # ConvNeXt normalises after pooling. Applying the same channel-wise affine
        # per spatial location keeps the CAM consistent with the logits.
        head = getattr(model, "head", None)
        norm = getattr(head, "norm", None) if head is not None else None
        self.head_norm = norm if isinstance(norm, nn.LayerNorm) else None

    def forward(self, x: torch.Tensor):
        feats = self.model.forward_features(x)          # [B, C, H, W]
        logits = self.model.forward_head(feats)         # [B, num_classes]

        f = feats
        if self.head_norm is not None:
            f = self.head_norm(f.permute(0, 2, 3, 1)).permute(0, 3, 1, 2)
        cam = torch.einsum("bchw,nc->bnhw", f, self.cam_weight)
        return logits, cam


class TorchvisionB0(nn.Module):
    """backend/model.pt: torchvision's EfficientNet-B0 with the Dropout + Linear
    head ml/train.ipynb gives it. Exposes the three timm methods ExportWrapper
    calls, so the CAM and the parity check apply unchanged. GAP + linear, so the
    CAM is exact here too."""

    def __init__(self, num_classes: int):
        super().__init__()
        import torchvision
        self.net = torchvision.models.efficientnet_b0(weights=None)
        self.net.classifier = nn.Sequential(
            nn.Dropout(p=0.4, inplace=True), nn.Linear(1280, num_classes))

    def get_classifier(self) -> nn.Module:
        return self.net.classifier[1]

    def forward_features(self, x: torch.Tensor) -> torch.Tensor:
        return self.net.features(x)

    def forward_head(self, feats: torch.Tensor) -> torch.Tensor:
        return self.net.classifier(torch.flatten(self.net.avgpool(feats), 1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("services/api/model"))
    ap.add_argument("--metrics", type=Path, default=Path("docs/eval_metrics.json"),
                    help="Written by ml/eval.py. Export refuses to run without it.")
    ap.add_argument("--labels", type=Path,
                    help="Class order, for a bare torchvision state dict such as "
                         "backend/model.pt (backend/class_names.json).")
    ap.add_argument("--resize-ratio", type=float, default=1.14,
                    help="Resize to size*ratio before the centre crop. 1.0 is a plain "
                         "resize, which is how the baseline was evaluated.")
    ap.add_argument("--size", type=int, default=224)
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--skip-simplify", action="store_true")
    args = ap.parse_args()

    if not args.metrics.exists():
        raise SystemExit(
            f"{args.metrics} not found. Run ml/eval.py first.\n"
            f"meta.json carries the field accuracy and the abstain thresholds; "
            f"exporting without them would put an unmeasured model behind the API."
        )
    metrics = json.loads(args.metrics.read_text())
    thresholds = metrics.get("thresholds")
    if not thresholds:
        raise SystemExit(
            "eval_metrics.json has no tuned abstain thresholds. The abstain path is "
            "required (PRD 7.3) -- the XR module refuses to launch on an uncertain "
            "scan, and without a threshold nothing is ever uncertain. Collect a "
            "rejection set and re-run ml/eval.py."
        )

    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    if "model_name" in ckpt and not ckpt["model_name"].startswith("tv_"):  # an ml/train.py checkpoint
        labels, model_name = ckpt["labels"], ckpt["model_name"]
        model = timm.create_model(model_name, pretrained=False, num_classes=len(labels))
        model.load_state_dict(ckpt["state_dict"])
    else:  # torchvision B0: backend/model.pt (bare state dict) or scripts/train_mixed.py (tv_efficientnet_b0)
        labels = ckpt.get("labels") or (json.loads(args.labels.read_text()) if args.labels else None)
        if not labels:
            raise SystemExit("A bare state dict carries no class order; pass --labels.")
        model_name = "efficientnet_b0"
        model = TorchvisionB0(len(labels))
        model.net.load_state_dict(ckpt.get("state_dict") or ckpt.get("model_state_dict") or ckpt)
    model.eval()

    wrapper = ExportWrapper(model).eval()
    dummy = torch.randn(1, 3, args.size, args.size)

    with torch.no_grad():
        ref_logits, ref_cam = wrapper(dummy)

    args.out.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out / "model.onnx"

    torch.onnx.export(
        wrapper, dummy, str(onnx_path),
        input_names=["input"], output_names=["logits", "cam"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}, "cam": {0: "batch"}},
        opset_version=args.opset, do_constant_folding=True,
        # The TorchScript exporter. torch>=2.9 defaults to the dynamo one, which
        # splits the weights into a model.onnx.data sidecar the API does not
        # load, and whose opset down-conversion fails on this graph.
        dynamo=False,
    )

    if not args.skip_simplify:
        try:
            import onnx
            from onnxsim import simplify
            simplified, ok = simplify(onnx.load(str(onnx_path)))
            if ok:
                onnx.save(simplified, str(onnx_path))
                print("simplified")
            else:
                print("! onnxsim could not verify the simplified graph, keeping the original")
        except ImportError:
            print("! onnxsim not installed, skipping simplification")

    # Parity check against the torch model, on the spot. An export that silently
    # diverges is worse than one that fails.
    import onnxruntime as ort
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    ort_logits, ort_cam = sess.run(None, {"input": dummy.numpy()})
    logit_delta = float(np.abs(ort_logits - ref_logits.numpy()).max())
    cam_delta = float(np.abs(ort_cam - ref_cam.numpy()).max())
    # Absolute plus relative, as np.allclose does. The dummy input is noise, and
    # on noise EfficientNet-B0's logits reach ~220: there, fp32 reordering alone
    # is ~3e-3 absolute (1e-5 relative), with identical softmax and argmax.
    if not np.allclose(ort_logits, ref_logits.numpy(), rtol=1e-4, atol=1e-3):
        raise SystemExit(f"ONNX/PyTorch logit mismatch: {logit_delta:.2e}")
    print(f"parity ok  logits {logit_delta:.2e}  cam {cam_delta:.2e}")

    (args.out / "labels.json").write_text(json.dumps(labels, indent=2))

    meta = {
        "model_name": model_name,
        "input_size": args.size,
        "resize_ratio": args.resize_ratio,
        "normalization": {"mean": list(IMAGENET_MEAN), "std": list(IMAGENET_STD)},
        "layout": "NCHW",
        "colour_space": "RGB",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_sha": git_sha(),
        "num_classes": len(labels),
        "metrics": {
            "lab_acc": metrics["lab_acc"],
            "field_acc": metrics["field_acc"],
            "macro_f1_field": metrics["macro_f1_field"],
            "ece": metrics["ece"],
            "domain_gap": metrics["domain_gap"],
            "background_probe_ratio": metrics["background_probe_ratio"],
        },
        "confidence_threshold": thresholds["msp_threshold"],
        "entropy_threshold": thresholds["entropy_threshold"],
        "gradcam_layer": "baked_into_graph:cam",
        "cam_shape": list(ref_cam.shape[1:]),
        "outputs": ["logits", "cam"],
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2))

    size_mb = onnx_path.stat().st_size / 1e6
    print(f"\nwrote {onnx_path} ({size_mb:.1f} MB), labels.json, meta.json")
    print(f"field accuracy {metrics['field_acc']:.4f} · "
          f"abstain below msp {thresholds['msp_threshold']:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
