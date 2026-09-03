import json
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Crop Disease Detector API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Content lives in data/, outside the service, because it is shared with ml/ and the web app.
DATA_DIR = os.environ.get(
    "DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "data")
)

with open(os.path.join(DATA_DIR, "disease_info.json")) as f:
    DISEASE_INFO: dict = json.load(f)

with open(os.path.join(DATA_DIR, "translations_te.json")) as f:
    TRANSLATIONS_TE: dict = json.load(f)


@app.get("/")
def root():
    return {"status": "ok", "message": "Crop Disease Detector API", "classes": len(DISEASE_INFO)}


@app.post("/predict")
async def predict_disease(file: UploadFile = File(...)):
    raise HTTPException(
        status_code=503,
        detail="Inference is offline. The PlantVillage model was removed; the "
        "field-trained ONNX model is not deployed yet.",
    )


@app.get("/diseases")
def list_diseases():
    return {"diseases": list(DISEASE_INFO.keys()), "count": len(DISEASE_INFO)}


@app.get("/treatment/{class_name:path}")
def get_treatment(class_name: str):
    info = DISEASE_INFO.get(class_name)
    if info is None:
        raise HTTPException(status_code=404, detail=f"No info found for '{class_name}'.")
    return info
