"""CropScan XR API. One FastAPI service, one Postgres.

No Redis, no Celery, no queue, no microservices.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.cycle import load_cycles
from app.inference import ModelUnavailable, load_model
from app.routers import diseases, health, ledger, legacy, orders, scans, videos, webhooks

log = logging.getLogger("cropscan")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Parse the knowledge base at startup. Malformed content should stop the
    # deploy, not surface as a blank panel in a headset.
    cycles = load_cycles()
    log.info("loaded %d disease cycles", len(cycles))

    # The ONNX session loads once. A missing model is not fatal at boot -- the
    # rest of the API is still useful and /healthz reports degraded -- but
    # /api/scans returns 503 rather than inventing a prediction.
    try:
        model = load_model()
        log.info("model %s ready, %d classes", model.version, len(model.labels))
    except ModelUnavailable as exc:
        log.warning("inference unavailable: %s", exc)

    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="CropScan XR API",
        version="2.0.0",
        summary="Diagnosis, disease cycle, and a hash-chained record of both.",
        lifespan=lifespan,
    )

    origins = ([o.strip() for o in settings.cors_origins.split(",")]
               if settings.cors_origins != "*" else ["*"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for module in (health, scans, diseases, ledger, videos, orders, webhooks):
        app.include_router(module.router)
    app.include_router(legacy.router)   # 308 shims, delete one release after cutover

    return app


app = create_app()
