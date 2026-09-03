from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.content import disease_info, info_for
from app.cycle import get_cycle, load_cycles
from app.db import get_db
from app.models import Video
from app.schemas import DiseaseDetail, DiseaseSummary, VideoOut

router = APIRouter(prefix="/api/diseases", tags=["diseases"])


def _video_out(v: Video) -> VideoOut:
    return VideoOut(
        id=v.id, disease_id=v.disease_id, kind=v.kind, title=v.title,
        hls_url=storage.signed_url(v.hls_key),
        poster_url=storage.signed_url(v.poster_key),
        duration_s=v.duration_s, projection=v.projection,
        stereo=v.stereo, language=v.language,
    )


@router.get("", response_model=list[DiseaseSummary])
def list_diseases(
    crop: str | None = Query(None, description="Filter by plant, e.g. Tomato"),
    has_cycle: bool | None = Query(None),
    db: Session = Depends(get_db),
) -> list[DiseaseSummary]:
    cycles = load_cycles()
    with_video = {
        row for row in db.execute(select(Video.disease_id).distinct()).scalars()
    }

    out = []
    for disease_id, info in disease_info().items():
        if crop and info["plant"].lower() != crop.lower():
            continue
        summary = DiseaseSummary(
            id=disease_id,
            name=info["name"],
            plant=info["plant"],
            is_healthy=info["is_healthy"],
            severity=info.get("severity"),
            has_cycle=disease_id in cycles,
            has_video=disease_id in with_video,
        )
        if has_cycle is not None and summary.has_cycle != has_cycle:
            continue
        out.append(summary)
    return out


@router.get("/{disease_id:path}/cycle")
def get_disease_cycle(
    disease_id: str,
    lang: str = Query("en", pattern="^(en|te)$"),
) -> dict:
    """The Section 8 object, resolved for a language.

    Healthy classes and diseases not yet written up return cycle: null rather
    than 404 -- the UI switches to browse mode on null, and a 404 would read as
    an error to the user when nothing is wrong.
    """
    if disease_id not in disease_info():
        raise HTTPException(404, "No such disease.")
    cycle = get_cycle(disease_id)
    return {"disease_id": disease_id, "cycle": cycle.localized(lang) if cycle else None}


@router.get("/{disease_id:path}", response_model=DiseaseDetail)
def get_disease(
    disease_id: str,
    lang: str = Query("en", pattern="^(en|te)$"),
    db: Session = Depends(get_db),
) -> DiseaseDetail:
    info = info_for(disease_id, lang)
    if info is None:
        raise HTTPException(404, "No such disease.")

    cycle = get_cycle(disease_id)
    videos = list(db.execute(
        select(Video).where(Video.disease_id == disease_id)
    ).scalars())

    return DiseaseDetail(
        id=disease_id,
        name=info["name"],
        plant=info["plant"],
        is_healthy=info["is_healthy"],
        severity=info.get("severity"),
        symptoms=info.get("symptoms"),
        organic=info.get("organic"),
        chemical=info.get("chemical"),
        prevention=info.get("prevention"),
        has_cycle=cycle is not None,
        has_video=bool(videos),
        cycle=cycle.localized(lang) if cycle else None,
        videos=[_video_out(v) for v in videos],
    )
