"""308 redirect shims for one release.

The deployed Vercel frontend calls /predict, /diseases and /treatment/{name}.
Those routes move under /api in this rebuild, and a hard 404 would break the
live site mid-migration. 308 preserves the method and body, so the old POST
/predict still works.

Delete this module one release after the new frontend ships.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter(tags=["legacy"], include_in_schema=False)

_PERMANENT = 308


@router.post("/predict")
def predict_shim() -> RedirectResponse:
    return RedirectResponse("/api/scans", status_code=_PERMANENT)


@router.get("/diseases")
def diseases_shim() -> RedirectResponse:
    return RedirectResponse("/api/diseases", status_code=_PERMANENT)


@router.get("/treatment/{class_name:path}")
def treatment_shim(class_name: str) -> RedirectResponse:
    return RedirectResponse(f"/api/diseases/{class_name}", status_code=_PERMANENT)
