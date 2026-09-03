"""Manifest-backed dataset and the augmentation policy.

The augmentation exists for one reason: PlantVillage-trained models key on
background, not lesions (PRD 4.1). Every transform below is chosen to make the
background unreliable as a cue, so the only thing left to learn is the lesion.
"""

from __future__ import annotations

import csv
from pathlib import Path

import albumentations as A
import cv2
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from torch.utils.data import Dataset

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def read_manifest(path: Path) -> list[dict]:
    with Path(path).open() as fh:
        return list(csv.DictReader(fh))


def load_labels(manifest_dir: Path) -> list[str]:
    """Ordered canonical class ids. Order is fixed by sorting, so a re-run
    cannot silently permute the output layer against an exported labels.json."""
    labels: set[str] = set()
    for split in ("train", "val", "test_lab", "test_field"):
        p = Path(manifest_dir) / f"{split}.csv"
        if p.exists():
            labels |= {r["label"] for r in read_manifest(p)}
    return sorted(labels)


def train_transform(size: int) -> A.Compose:
    return A.Compose([
        # Crop hard: a lesion should still be identifiable without the pot,
        # the hand, or the lab bench in frame.
        A.RandomResizedCrop(size=(size, size), scale=(0.5, 1.0), ratio=(0.8, 1.25)),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.2),
        A.Affine(rotate=(-25, 25), shear=(-8, 8), scale=(0.9, 1.1), p=0.6),

        # Field photos are taken in whatever light exists.
        A.RandomBrightnessContrast(0.25, 0.25, p=0.7),
        A.HueSaturationValue(10, 25, 15, p=0.5),
        A.RandomShadow(p=0.3),
        A.RandomSunFlare(src_radius=90, p=0.05),

        # Phone camera reality: motion, focus, and compression.
        A.OneOf([A.MotionBlur(blur_limit=7), A.GaussianBlur(blur_limit=(3, 7)),
                 A.Defocus(radius=(1, 4))], p=0.35),
        A.ImageCompression(quality_range=(35, 90), p=0.5),
        A.GaussNoise(p=0.2),

        # CoarseDropout punches holes in the image. If the model was leaning on
        # a background region, this is what takes it away.
        A.CoarseDropout(num_holes_range=(1, 8),
                        hole_height_range=(0.05, 0.15),
                        hole_width_range=(0.05, 0.15), p=0.4),

        A.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ToTensorV2(),
    ])


def eval_transform(size: int) -> A.Compose:
    return A.Compose([
        A.Resize(int(size * 1.14), int(size * 1.14)),
        A.CenterCrop(size, size),
        A.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ToTensorV2(),
    ])


def mask_leaf_transform(size: int) -> A.Compose:
    """Background-bias probe (PRD 9, issues #8.5).

    Removes the leaf and keeps the background. A model that reads lesions should
    collapse to chance here. One that beats chance is reading the bench, the
    hand, or the lighting -- and the report has to say so.

    ponytail: green-chromaticity threshold in HSV, not a segmentation net.
    It is crude, and on a yellowed chlorotic leaf it under-masks. That is
    acceptable for a probe whose only job is "is this well above chance?" --
    under-masking biases the probe toward looking FINE, so a positive result is
    still trustworthy. Swap in a real segmenter if the number lands ambiguous.
    """
    class MaskLeaf(A.ImageOnlyTransform):
        def __init__(self):
            super().__init__(p=1.0)

        def apply(self, img, **_):
            hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
            leaf = cv2.inRange(hsv, (15, 40, 25), (95, 255, 255))
            leaf = cv2.morphologyEx(leaf, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
            leaf = cv2.dilate(leaf, np.ones((15, 15), np.uint8))
            out = img.copy()
            out[leaf > 0] = 0
            return out

    return A.Compose([
        A.Resize(int(size * 1.14), int(size * 1.14)),
        A.CenterCrop(size, size),
        MaskLeaf(),
        A.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ToTensorV2(),
    ])


class LeafDataset(Dataset):
    def __init__(self, manifest: Path, labels: list[str], transform, root: Path = Path(".")):
        self.rows = read_manifest(manifest)
        self.labels = labels
        self.index = {name: i for i, name in enumerate(labels)}
        self.transform = transform
        self.root = Path(root)

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, i: int):
        row = self.rows[i]
        img = cv2.imread(str(self.root / row["path"]), cv2.IMREAD_COLOR)
        if img is None:
            raise FileNotFoundError(row["path"])
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return self.transform(image=img)["image"], self.index[row["label"]]

    def class_weights(self) -> torch.Tensor:
        """Inverse-frequency weights. The corpus stays imbalanced even after
        capping, and macro-F1 is what we early-stop on."""
        counts = np.zeros(len(self.labels))
        for row in self.rows:
            counts[self.index[row["label"]]] += 1
        counts = np.maximum(counts, 1)
        w = counts.sum() / (len(counts) * counts)
        return torch.tensor(w, dtype=torch.float32)
