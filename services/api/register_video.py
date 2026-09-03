"""Register a transcoded clip as a `video` row.

Pairs with tools/transcode.sh, which writes the video.json this reads.

    python services/api/register_video.py out/apple-scab-360/video.json \
        --disease-id Apple___Apple_scab --kind field360 --title "Scab in a wet orchard"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import Video


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", type=Path, help="video.json written by transcode.sh")
    ap.add_argument("--disease-id", required=True)
    ap.add_argument("--kind", required=True,
                    choices=["treatment", "field360", "symptom_closeup"])
    ap.add_argument("--title", required=True)
    ap.add_argument("--language", default="en", choices=["en", "te"])
    args = ap.parse_args()

    meta = json.loads(args.manifest.read_text())
    session = get_sessionmaker()()

    existing = session.execute(
        select(Video).where(Video.hls_key == meta["hls_key"])
    ).scalar_one_or_none()
    if existing:
        print(f"already registered: {existing.id}")
        return 0

    video = Video(
        disease_id=args.disease_id,
        kind=args.kind,
        title=args.title,
        hls_key=meta["hls_key"],
        poster_key=meta.get("poster_key"),
        duration_s=meta.get("duration_s"),
        projection=meta.get("projection", "flat"),
        stereo=meta.get("stereo", "none"),
        language=args.language,
    )
    session.add(video)
    session.commit()
    print(f"registered {video.id}  {args.disease_id}  {meta['projection']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
