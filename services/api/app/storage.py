"""S3-compatible object storage with signed URLs.

MinIO locally, R2 or Supabase in deployment -- same API. Media never goes into
Postgres and never gets served from the app process.
"""

from __future__ import annotations

from functools import lru_cache

import boto3
from botocore.config import Config

from app.config import get_settings


@lru_cache(maxsize=1)
def _client():
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url or None,
        aws_access_key_id=s.s3_access_key_id or None,
        aws_secret_access_key=s.s3_secret_access_key or None,
        region_name=s.s3_region,
        config=Config(signature_version="s3v4"),
    )


def put(key: str, data: bytes, content_type: str) -> str:
    _client().put_object(
        Bucket=get_settings().s3_bucket, Key=key, Body=data, ContentType=content_type
    )
    return key


# Prefixes served without a signature.
#
# HLS cannot use presigned URLs. The master playlist references child playlists
# and segments by RELATIVE path, so the player resolves them against the signed
# parent and requests them WITHOUT the signature -- every one 403s. Signing only
# the master breaks playback entirely.
#
# The split is by what actually needs protecting. A scan image is a photograph
# somebody took on their own farm, so it stays signed and short-lived. Video is
# curated footage we publish on purpose; signing it would be security theatre
# that happens to break the format.
PUBLIC_PREFIXES = ("videos/",)


def is_public(key: str) -> bool:
    return key.startswith(PUBLIC_PREFIXES)


def public_url(key: str) -> str:
    s = get_settings()
    return f"{s.s3_endpoint_url.rstrip('/')}/{s.s3_bucket}/{key}"


def url_for(key: str | None, ttl: int | None = None) -> str | None:
    """Public URL for curated media, presigned URL for anything private."""
    if not key:
        return None
    if is_public(key):
        return public_url(key)

    s = get_settings()
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": s.s3_bucket, "Key": key},
        ExpiresIn=ttl or s.signed_url_ttl_seconds,
    )


# Kept so existing callers keep working; url_for is the one to use.
signed_url = url_for


def healthy() -> bool:
    try:
        _client().head_bucket(Bucket=get_settings().s3_bucket)
        return True
    except Exception:
        return False
