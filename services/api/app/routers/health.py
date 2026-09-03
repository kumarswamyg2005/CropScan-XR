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
