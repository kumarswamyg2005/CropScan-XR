from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import LANG_PATTERN
from app.db import get_db
from app.models import Video
from app.routers.diseases import _video_out
from app.schemas import VideoOut

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.get("", response_model=list[VideoOut])
def list_videos(
    disease_id: str | None = Query(None),
    kind: str | None = Query(None, pattern="^(treatment|field|field360|symptom_closeup)$"),
    lang: str = Query("en", pattern=LANG_PATTERN),
    db: Session = Depends(get_db),
) -> list[VideoOut]:
    stmt = select(Video)
    if disease_id:
        stmt = stmt.where(Video.disease_id == disease_id)
    if kind:
        stmt = stmt.where(Video.kind == kind)
    # Fall back to English rather than filtering to nothing. Every ingested row
    # is 'en', so an unconditional language filter meant a Telugu user got an
    # empty list here while the disease-detail endpoint, which does not filter,
    # still showed them the same clips.
    rows = list(db.execute(stmt.where(Video.language == lang)).scalars())
    if not rows and lang != "en":
        rows = list(db.execute(stmt.where(Video.language == "en")).scalars())
    return [_video_out(v) for v in rows]
