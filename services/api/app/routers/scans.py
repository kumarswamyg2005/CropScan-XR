from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app import inference, ledger, storage
from app.content import info_for
from app.cycle import get_cycle
from app.config import get_settings
from app.db import get_db
from app.models import Scan
from app.schemas import ScanOut

router = APIRouter(prefix="/api/scans", tags=["scans"])


def _to_out(scan: Scan, lang: str) -> ScanOut:
    cycle = get_cycle(scan.disease_id) if scan.disease_id else None

    if scan.status == "uncertain":
        blocked = ("This scan was not confident enough to identify a disease. "
                   "The field module would tell a story about the wrong pathogen.")
    elif cycle is None:
        blocked = "There is no disease cycle written up for this diagnosis yet."
    else:
        blocked = None

    return ScanOut(
        id=scan.id,
        created_at=scan.created_at,
        status=scan.status,
        disease_id=scan.disease_id,
        confidence=scan.confidence,
        top3=scan.top3,
        model_version=scan.model_version,
        image_url=storage.signed_url(scan.image_key),
        gradcam_url=storage.signed_url(scan.gradcam_key),
        info=info_for(scan.disease_id, lang) if scan.disease_id else None,
        has_cycle=cycle is not None,
        can_enter_field=blocked is None,
        field_blocked_reason=blocked,
    )


@router.post("", response_model=ScanOut, status_code=201)
async def create_scan(
    file: UploadFile = File(...),
    lang: str = Query("en", pattern="^(en|te)$"),
    db: Session = Depends(get_db),
) -> ScanOut:
    settings = get_settings()

    # Read one byte past the limit, not the whole body. Reading everything and
    # then measuring it means the limit protects nothing -- a 2 GB upload is
    # already resident by the time it is rejected.
    limit = settings.max_upload_bytes
    raw = await file.read(limit + 1)
    if not raw:
        raise HTTPException(400, "Empty upload.")
    if len(raw) > limit:
        raise HTTPException(413, f"Image is larger than {limit // (1024 * 1024)} MB.")

    # ONNX inference, image encoding and the S3 puts are all blocking. Run on
    # the endpoint's own thread and every other request -- including /healthz --
    # waits for the whole scan. FastAPI hands sync work to a threadpool, so the
    # blocking part is isolated in one.
    def analyse():
        # Content-type is a client claim. The decode is the actual check.
        image = inference.decode_image(raw)
        return image, inference.predict(image)

    try:
        image, prediction = await run_in_threadpool(analyse)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except inference.ModelUnavailable as exc:
        raise HTTPException(503, f"Inference is unavailable: {exc}") from exc

    image_sha = inference.sha256_bytes(raw)
    scan_id = str(uuid.uuid4())

    # Store the EXIF-stripped image, never the original bytes. The original may
    # carry GPS coordinates of someone's farm.
    def store():
        import io

        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=90)
        key = storage.put(f"scans/{scan_id}/image.jpg", buf.getvalue(), "image/jpeg")

        cam_key = None
        if prediction.cam is not None:
            cam_key = storage.put(
                f"scans/{scan_id}/gradcam.png",
                inference.cam_overlay(image, prediction.cam),
                "image/png",
            )
        return key, cam_key

    image_key, gradcam_key = await run_in_threadpool(store)

    scan = Scan(
        id=scan_id,
        image_key=image_key,
        image_sha256=image_sha,
        model_version=prediction.model_version,
        disease_id=prediction.disease_id,
        confidence=prediction.confidence,
        top3=[t for t in prediction.top3],
        status=prediction.status,
        gradcam_key=gradcam_key,
        client_meta={"filename": file.filename, "content_type": file.content_type},
    )
    db.add(scan)

    # The scan row and its ledger entry commit together. A diagnosis that exists
    # without a ledger record would break the one property this system sells.
    ledger.append(
        db,
        event_type="scan.created" if prediction.status == "ok" else "scan.uncertain",
        subject_id=scan_id,
        payload={
            "scan_id": scan_id,
            "image_sha256": image_sha,
            "model_version": prediction.model_version,
            "disease_id": prediction.disease_id,
            "confidence": round(prediction.confidence, 6),
            "status": prediction.status,
        },
    )
    db.commit()
    db.refresh(scan)
    return _to_out(scan, lang)


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(
    scan_id: str,
    lang: str = Query("en", pattern="^(en|te)$"),
    db: Session = Depends(get_db),
) -> ScanOut:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(404, "No such scan.")
    return _to_out(scan, lang)
