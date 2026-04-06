import io
import json
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from model import CLASS_NAMES, predict

app = FastAPI(title="Crop Disease Detector API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load disease info once at startup
_disease_info_path = os.path.join(os.path.dirname(__file__), "disease_info.json")
with open(_disease_info_path) as f:
    DISEASE_INFO: dict = json.load(f)

_translations_path = os.path.join(os.path.dirname(__file__), "translations_te.json")
with open(_translations_path) as f:
    TRANSLATIONS_TE: dict = json.load(f)


@app.get("/")
def root():
    return {"status": "ok", "message": "Crop Disease Detector API", "classes": len(CLASS_NAMES)}


@app.post("/predict")
async def predict_disease(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    contents = await file.read()
    try:
        image = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image.")

    predictions = predict(image, top_k=3)

    top = predictions[0]
    class_name = top["class_name"]
    disease_info = DISEASE_INFO.get(class_name, {})

    return {
        "class_name": class_name,
        "confidence": top["confidence"],
        "top3": predictions,
        "disease_info": disease_info,
        "disease_info_te": TRANSLATIONS_TE.get(class_name, {}),
    }


@app.get("/diseases")
def list_diseases():
    return {"diseases": list(DISEASE_INFO.keys()), "count": len(DISEASE_INFO)}


@app.get("/treatment/{class_name:path}")
def get_treatment(class_name: str):
    info = DISEASE_INFO.get(class_name)
    if info is None:
        raise HTTPException(status_code=404, detail=f"No info found for '{class_name}'.")
    return info
