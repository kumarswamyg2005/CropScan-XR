from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import storage
from app.cycle import load_cycles
from app.db import get_db
from app.inference import ModelUnavailable, load_model
from app.schemas import HealthOut

router = APIRouter()


@router.get("/", include_in_schema=False)
def root() -> dict:
    """A plain answer for whoever opens the bare API URL, instead of a 404
    that reads as a broken deploy."""
    return {"service": "CropScan API", "health": "/healthz", "docs": "/docs"}


@router.get("/healthz", response_model=HealthOut)
def healthz(db: Session = Depends(get_db)) -> HealthOut:
    try:
        model = load_model()
        model_version: str | None = model.version
    except (ModelUnavailable, Exception):
        model_version = None

    try:
        db.execute(text("select 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return HealthOut(
        status="ok" if (model_version and db_ok) else "degraded",
        model_loaded=model_version is not None,
        model_version=model_version,
        db_reachable=db_ok,
        storage_reachable=storage.healthy(),
        cycles_loaded=len(load_cycles()),
    )


@router.get("/api/model")
def model_card() -> dict:
    """The numbers /about publishes.

    Served from meta.json rather than hardcoded in the frontend, so the site
    cannot drift from the model that is actually deployed. If there is no
    model, the page says so instead of showing a stale figure.
    """
    try:
        model = load_model()
    except Exception:
        return {"available": False}

    meta = model.meta
    return {
        "available": True,
        "model_name": meta["model_name"],
        "model_version": model.version,
        "trained_at": meta.get("trained_at"),
        "num_classes": meta["num_classes"],
        "metrics": meta["metrics"],
        "confidence_threshold": meta["confidence_threshold"],
        "entropy_threshold": meta["entropy_threshold"],
    }
