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


def signed_url(key: str | None, ttl: int | None = None) -> str | None:
    if not key:
        return None
    s = get_settings()
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": s.s3_bucket, "Key": key},
        ExpiresIn=ttl or s.signed_url_ttl_seconds,
    )


def healthy() -> bool:
    try:
        _client().head_bucket(Bucket=get_settings().s3_bucket)
        return True
    except Exception:
        return False
