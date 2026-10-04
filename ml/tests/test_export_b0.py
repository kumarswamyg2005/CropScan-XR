"""The torchvision baseline goes through the same CAM wrapper as timm models.

For a global-average-pool + linear head the class map is exact: averaging the
CAM over space and adding the bias must give back the logits. If the adapter
wired the wrong layer, this is what breaks.
"""

import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("torchvision")
pytest.importorskip("timm")  # export.py imports it at module level

from export import ExportWrapper, TorchvisionB0  # noqa: E402


def test_cam_reproduces_the_logits():
    model = TorchvisionB0(num_classes=5).eval()
    wrapper = ExportWrapper(model).eval()
    with torch.no_grad():
        logits, cam = wrapper(torch.randn(2, 3, 224, 224))
    assert cam.shape == (2, 5, 7, 7)
    bias = model.get_classifier().bias
    assert torch.allclose(cam.mean(dim=(2, 3)) + bias, logits, atol=1e-4)
