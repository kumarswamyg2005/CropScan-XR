"""Ingest data/video_catalogue.json: download, transcode, upload, register.

    python tools/ingest_catalogue.py                 # everything
    python tools/ingest_catalogue.py --only spider-mites-leaf
    python tools/ingest_catalogue.py --skip-existing

Refuses to register a clip with no attribution. Most of this footage is CC BY
or CC BY-SA and attribution is a licence condition, not a nicety -- making the
script fail is the only way that stays true when someone adds an entry in a
hurry.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "services" / "api"))

CATALOGUE = REPO / "data" / "video_catalogue.json"
WORK = Path(os.environ.get("VIDEO_WORK_DIR", "/tmp/cropscan-video"))

UA = "CropScanXR/1.0 (educational project; contact via repository)"


def download(url: str, target: Path) -> Path:
    if target.exists() and target.stat().st_size > 0:
        print(f"    cached {target.name}")
        return target
    target.parent.mkdir(parents=True, exist_ok=True)

    # Commons filenames contain spaces, and http.client rejects a raw space in
    # the request path. Quote the path only -- quoting the whole URL would eat
    # the scheme separator.
    parts = urllib.parse.urlsplit(url)
    safe = urllib.parse.urlunsplit(
        parts._replace(path=urllib.parse.quote(parts.path))
    )

    # Wikimedia rejects the default urllib agent.
    request = urllib.request.Request(safe, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as fh:
        fh.write(response.read())
    print(f"    downloaded {target.name} ({target.stat().st_size // 1024} KB)")
    return target


def transcode(source: Path, out_dir: Path, projection: str, stereo: str) -> dict:
    manifest = out_dir / "video.json"
    if manifest.exists():
        print(f"    cached HLS {out_dir.name}")
        return json.loads(manifest.read_text())

    subprocess.run(
        ["bash", str(REPO / "tools" / "transcode.sh"), str(source), str(out_dir),
         "--projection", projection, "--stereo", stereo],
        check=True, stdout=subprocess.DEVNULL,
    )
    print(f"    transcoded -> {out_dir.name}")
    return json.loads(manifest.read_text())


def upload(out_dir: Path, prefix: str) -> None:
    import boto3
    from botocore.config import Config

    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL"),
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )
    bucket = os.environ.get("S3_BUCKET", "cropscan-media")
    types = {".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t",
             ".mp4": "video/mp4", ".jpg": "image/jpeg"}

    count = 0
    for f in sorted(out_dir.iterdir()):
        if f.name == "video.json":
            continue
        s3.upload_file(
            str(f), bucket, f"videos/{prefix}/{f.name}",
            ExtraArgs={"ContentType": types.get(f.suffix, "application/octet-stream")},
        )
        count += 1
    print(f"    uploaded {count} objects")


def register(entry: dict, meta: dict) -> int:
    from sqlalchemy import select

    from app.db import get_sessionmaker
    from app.models import Video

    session = get_sessionmaker()()
    added = 0
    for disease_id in entry["disease_ids"]:
        exists = session.execute(
            select(Video).where(
                Video.hls_key == meta["hls_key"], Video.disease_id == disease_id
            )
        ).scalar_one_or_none()
        if exists:
            continue
        session.add(Video(
            disease_id=disease_id,
            kind=entry["kind"],
            title=entry["title"],
            caption=entry.get("caption"),
            stage_id=entry.get("stage_id"),
            hls_key=meta["hls_key"],
            poster_key=meta.get("poster_key"),
            duration_s=meta.get("duration_s"),
            projection=entry["projection"],
            stereo=entry["stereo"],
            language="en",
            license=entry["license"],
            attribution=entry["attribution"],
            source_url=entry.get("source_url"),
        ))
        added += 1
    session.commit()
    print(f"    registered for {added} disease(s)")
    return added


def synthetic_source(target: Path) -> Path:
    """The equirect placeholder, so the 360 path stays exercised."""
    if target.exists():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=0x9FB8D4:s=2048x420:d=14",
        "-f", "lavfi", "-i", "color=c=0x6E8F4E:s=2048x604:d=14",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100:d=14",
        "-filter_complex",
        "[0:v]noise=alls=10:allf=t,drawgrid=w=256:h=140:t=2:c=0xB8CBE0@0.7[sky];"
        "[1:v]noise=alls=26:allf=t,drawgrid=w=256:h=151:t=2:c=0x3E5C2E@0.8,"
        "drawbox=x=300:y=120:w=90:h=90:color=0x7A3B22@0.9:t=fill,"
        "drawbox=x=980:y=300:w=120:h=120:color=0x7A3B22@0.9:t=fill,"
        "drawbox=x=1600:y=180:w=70:h=70:color=0xB8951C@0.9:t=fill[ground];"
        "[sky][ground]vstack=inputs=2[v]",
        "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-shortest",
        str(target),
    ], check=True)
    return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", help="ingest just these catalogue ids")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    catalogue = json.loads(CATALOGUE.read_text())
    entries = catalogue["videos"]
    if args.only:
        entries = [e for e in entries if e["id"] in set(args.only)]

    # Licence conditions, checked before anything is downloaded.
    unattributed = [e["id"] for e in entries if not e.get("attribution")]
    if unattributed:
        raise SystemExit(
            f"Refusing to ingest {unattributed}: no attribution.\n"
            f"CC BY and CC BY-SA require it, and the player renders it from the row."
        )

    total = 0
    for entry in entries:
        print(f"\n{entry['id']}  [{entry['license']}]")
        out_dir = WORK / entry["id"]

        if args.dry_run:
            print(f"    would ingest -> videos/{entry['id']}/")
            continue

        if entry.get("generated"):
            source = synthetic_source(WORK / f"{entry['id']}-source.mp4")
        else:
            url = entry["download"]
            suffix = Path(urllib.parse.urlparse(url).path).suffix or ".video"
            source = download(url, WORK / f"{entry['id']}-source{suffix}")

        meta = transcode(source, out_dir, entry["projection"], entry["stereo"])
        meta["hls_key"] = f"videos/{entry['id']}/index.m3u8"
        meta["poster_key"] = f"videos/{entry['id']}/poster.jpg"

        upload(out_dir, entry["id"])
        total += register(entry, meta)

    print(f"\n{total} video rows registered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
