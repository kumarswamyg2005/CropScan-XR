# CropScan — AI Crop Disease Detector

An end-to-end deep learning application that identifies plant diseases from leaf images across 38 disease classes with **99.3% test accuracy**.

![Training Curves](training_curves%20(2).png)

---

## Features

- **38-class disease detection** — covers Apple, Corn, Grape, Potato, Tomato and more from the PlantVillage dataset
- **Treatment advice** — organic, chemical, and prevention tips for every detected disease
- **Telugu language support** — full UI and disease info in English and Telugu (తెలుగు)
- **Top-3 predictions** — confidence scores for the top 3 candidates
- **Premium UI** — "Field & Science" design with Playfair Display + DM Mono typography

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ML Model | EfficientNet-B0 (PyTorch, transfer learning) |
| Backend | FastAPI + Uvicorn |
| Frontend | React + Vite + Tailwind CSS |
| Dataset | PlantVillage (54,306 images, 38 classes) |

---

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app
│   ├── model.py             # Model loading + inference
│   ├── disease_info.json    # English treatment data (38 classes)
│   ├── translations_te.json # Telugu translations
│   ├── class_names.json     # Class labels
│   ├── model.pt             # Trained EfficientNet-B0 weights
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── pages/           # Home, Detect, Result, About
│       ├── components/      # Navbar
│       └── context/         # Language context (EN/TE)
└── ml/
    └── train.ipynb          # Kaggle training notebook
```

---

## Model Training

Two-phase EfficientNet-B0 fine-tuning on PlantVillage:

| Phase | Epochs | What was trained |
|-------|--------|-----------------|
| 1 | 5 | Classifier head only (backbone frozen) |
| 2 | 10 | Full network (lower LR) |

- **Test accuracy:** 99.3%
- **Training platform:** Kaggle (GPU T4 x2)
- **Input size:** 224×224, ImageNet normalization

---

## Running Locally

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# API available at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App available at http://localhost:5173
```

Set the backend URL in frontend if needed:
```bash
# frontend/.env
VITE_API_URL=http://localhost:8000
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/predict` | Upload leaf image → returns disease class, confidence, top-3, treatment info |
| `GET` | `/diseases` | List all 38 supported disease classes |
| `GET` | `/treatment/{class_name}` | Get treatment info for a specific class |

### Example response

```json
{
  "class_name": "Tomato___Early_blight",
  "confidence": 94.7,
  "top3": [...],
  "disease_info": {
    "name": "Tomato Early Blight",
    "severity": "moderate",
    "symptoms": "...",
    "organic": "...",
    "chemical": "...",
    "prevention": "..."
  },
  "disease_info_te": {
    "name": "టమాటా ఎర్లీ బ్లైట్",
    "symptoms": "..."
  }
}
```

---

## Supported Crops & Diseases

Apple (4), Blueberry, Cherry, Corn (4), Grape (4), Orange, Peach, Bell Pepper, Potato (3), Raspberry, Soybean, Squash, Strawberry, Tomato (10)

> Healthy classes are included — the model also detects when a plant is healthy.

---

## Deployment

- **Backend:** Deployable on Render or Hugging Face Spaces (Dockerfile included)
- **Frontend:** Deployable on Vercel (`npm run build` → deploy `dist/`)
