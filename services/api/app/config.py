from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Paths are derived from where this file actually sits, not from an assumed
# checkout depth. In the container the app is copied to /app/app, so
# parents[3] does not exist and raised IndexError at import -- which every
# entrypoint hits, so neither uvicorn nor `alembic upgrade head` could start.
_APP_DIR = Path(__file__).resolve().parent          # .../app
SERVICE_DIR = _APP_DIR.parent                       # .../services/api, or /app
_REPO_ROOT = (
    SERVICE_DIR.parents[1] if len(SERVICE_DIR.parents) >= 2 else SERVICE_DIR
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://cropscan:cropscan@localhost:5432/cropscan"

    model_dir: Path = SERVICE_DIR / "model"
    data_dir: Path = _REPO_ROOT / "data"

    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket: str = "cropscan-media"
    s3_region: str = "us-east-1"
    signed_url_ttl_seconds: int = 3600

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    max_upload_bytes: int = 10 * 1024 * 1024   # 10 MB, section 9.3
    ledger_anchor_enabled: bool = False        # Phase 10 stretch, default off

    cors_origins: str = "*"

    @property
    def is_payment_configured(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
