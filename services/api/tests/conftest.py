import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

REPO = Path(__file__).resolve().parents[3]

# Set, not setdefault. These MUST override whatever is already in the
# environment: a developer who has sourced .env, or CI with real secrets
# configured, would otherwise run the signature tests against one key while the
# app verifies with another, and the six payment cases fail for a reason that
# has nothing to do with the code.
#
# Explicit environment variables also outrank Settings' .env file in
# pydantic-settings' precedence order, which is what keeps a real .env out.
os.environ["DATA_DIR"] = str(REPO / "data")
# An empty model directory, not services/api/model: whether a developer has run
# ml/export.py must not change what the suite tests. The no-model path is the
# one under test here.
os.environ["MODEL_DIR"] = tempfile.mkdtemp(prefix="cropscan-no-model-")
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_fake"
os.environ["RAZORPAY_KEY_SECRET"] = "test_secret"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "webhook_secret"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.pop("S3_ACCESS_KEY_ID", None)
os.environ.pop("S3_SECRET_ACCESS_KEY", None)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import Base, get_db
from app.models import Product, Scan

# The settings object is cached; drop anything built while the real
# environment was still visible.
get_settings.cache_clear()


@pytest.fixture
def db_session():
    """In-memory SQLite. The models use a portable JSON type and the ledger
    skips the Postgres advisory lock off-dialect, so the chain and payment
    logic run here unchanged."""
    # StaticPool + check_same_thread: TestClient runs the app on another
    # thread, and an in-memory SQLite database is per-connection, so both
    # sides must share one connection or they see different databases.
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db_session, monkeypatch):
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session

    # No network in tests. Razorpay order creation is stubbed; signature
    # verification is the real code path and stays real.
    monkeypatch.setattr(
        "app.payments.create_remote_order",
        lambda amount_paise, receipt: {"id": f"order_{receipt[:12]}", "amount": amount_paise},
    )
    # Object storage is not under test here.
    monkeypatch.setattr("app.storage.signed_url", lambda key, ttl=None: f"https://signed/{key}" if key else None)
    monkeypatch.setattr("app.storage.healthy", lambda: True)

    with TestClient(app) as c:
        yield c


@pytest.fixture
def product(db_session):
    p = Product(sku="kit-scab-01", kind="kit", title="Apple scab treatment kit",
                price_paise=149900, disease_id="Apple___Apple_scab")
    db_session.add(p)
    db_session.commit()
    return p


@pytest.fixture
def scan(db_session):
    s = Scan(image_key="scans/x/image.jpg", image_sha256="a" * 64,
             model_version="convnext_tiny@abc123", disease_id="Apple___Apple_scab",
             confidence=0.94, top3=[], status="ok")
    db_session.add(s)
    db_session.commit()
    return s
