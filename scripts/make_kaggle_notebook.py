"""Build experiments/kaggle_train.ipynb: one self-contained notebook for Step 4.

    python scripts/make_kaggle_notebook.py

It embeds scripts/train_mixed.py and experiments/manifest.json (gzip+base64),
downloads PlantVillage (HF), PlantWild v1 (HF) and PlantDoc (GitHub) itself,
runs the 3 x 2 grid (lab/field/mixed x base/field augmentation) and zips the
results for download. Kaggle settings: GPU on, Internet on.
"""

from __future__ import annotations

import base64
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def b64(path: Path) -> str:
    return base64.b64encode(gzip.compress(path.read_bytes(), 9)).decode()


def cell(kind: str, src: str) -> dict:
    c = {"cell_type": kind, "metadata": {}, "source": src.strip("\n").splitlines(keepends=True)}
    if kind == "code":
        c.update(execution_count=None, outputs=[])
    return c


def main() -> None:
    import sys
    deploy = "--deploy" in sys.argv
    grid = '[("deploy", "field")]' if deploy else '[(d, a) for d in ("lab", "field", "mixed") for a in ("base", "field")]'
    script, manifest = b64(ROOT / "scripts" / "train_mixed.py"), b64(ROOT / "experiments" / "manifest.json")
    cells = [
        cell("markdown", """
# CropScan: lab -> field fine-tuning (Step 4)

**Before running:** Settings -> Accelerator **GPU (T4 or P100)**, Internet **On**.
Then **Run All**. About 1.5-2.5 hours for 6 runs. When it finishes, download
`cropscan_runs.zip` from the Output panel and give it to Claude.

Same recipe as the original CropScan notebook (EfficientNet-B0, 5 head + 15 full
epochs); only the training data and augmentation change. Seed 42.
"""),
        cell("code", """
import torch, subprocess, sys
print("GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NONE - turn on the GPU in Settings")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "datasets", "scikit-learn"], check=True)
"""),
        cell("code", f"""
# Embedded copies of scripts/train_mixed.py and experiments/manifest.json
import base64, gzip, pathlib
pathlib.Path("/kaggle/working/train_mixed.py").write_bytes(gzip.decompress(base64.b64decode("{script}")))
pathlib.Path("/kaggle/working/manifest.json").write_bytes(gzip.decompress(base64.b64decode("{manifest}")))
print("files written")
"""),
        cell("code", """
# Datasets: PlantWild v1 (HF), PlantDoc (GitHub). PlantVillage loads from HF inside the script.
import os, zipfile, urllib.request, shutil
from huggingface_hub import hf_hub_download
DATA = "/tmp/data"; os.makedirs(DATA, exist_ok=True)
zip_pw = hf_hub_download("uqtwei2/PlantWild", "plantwild.zip", repo_type="dataset")
zipfile.ZipFile(zip_pw).extractall(f"{DATA}/plantwild")
urllib.request.urlretrieve("https://codeload.github.com/pratikkayal/PlantDoc-Dataset/zip/refs/heads/master", "/tmp/pd.zip")
zipfile.ZipFile("/tmp/pd.zip").extractall("/tmp/pd")
shutil.move("/tmp/pd/PlantDoc-Dataset-master", f"{DATA}/plantdoc")
# 6 PlantDoc files differ only by letter case (CAR1.jpg / car1.jpg). The manifest was
# built on macOS, which cannot hold both, so the second copy is named *__casedup.
import json
for s in ("train", "val", "test"):
    for p, _ in json.load(open("/kaggle/working/manifest.json"))["plantdoc"][s]:
        if "__casedup" in p:
            shutil.copy(f"{DATA}/plantdoc/" + p.replace("__casedup", ""), f"{DATA}/plantdoc/" + p)
from datasets import load_dataset
for s in ("train", "test"):
    print("PlantVillage", s, len(load_dataset("GVJahnavi/PlantVillage_dataset", split=s)))
"""),
        cell("code", """
# Every file the manifest names must exist before any GPU time is spent.
import json, os
m = json.load(open("/kaggle/working/manifest.json"))
for ds in ("plantwild", "plantdoc"):
    root = os.path.join("/tmp/data", m[ds]["root"])
    missing = [p for s in ("train", "val", "test") for p, _ in m[ds][s] if not os.path.exists(os.path.join(root, p))]
    print(ds, {s: len(m[ds][s]) for s in ("train", "val", "test")}, "missing:", len(missing), missing[:3])
    assert not missing
"""),
        cell("code", """
GRID = """ + grid + """
# Training runs. Each prints one line per epoch and its test scores at the end.
import subprocess, sys
for data, aug in GRID:
    subprocess.run([sys.executable, "/kaggle/working/train_mixed.py", "--data", data, "--aug", aug,
                    "--manifest", "/kaggle/working/manifest.json", "--data-root", "/tmp/data",
                    "--out", "/kaggle/working/runs", "--workers", "4"], check=True)
"""),
        cell("code", """
import json, glob, shutil
for f in sorted(glob.glob("/kaggle/working/runs/*/result.json")):
    r = json.load(open(f))
    print(f"{r['run']:13}", " | ".join(f"{d}: {t['top1']}% F1 {t['macro_f1']}" for d, t in r["test"].items()))
shutil.make_archive("/kaggle/working/cropscan_runs", "zip", "/kaggle/working/runs")
print("download cropscan_runs.zip from the Output panel")
"""),
    ]
    nb = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                                       "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
    out = ROOT / "experiments" / ("kaggle_deploy.ipynb" if deploy else "kaggle_train.ipynb")
    out.write_text(json.dumps(nb, indent=1))
    print(f"wrote {out} ({out.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
