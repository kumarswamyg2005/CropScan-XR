"""Tables per PRD 7. Seven of them, one Postgres, no extensions.

ledger_entry is append-only. There is no update or delete path anywhere in this
codebase, and the migration revokes UPDATE and DELETE on it from the application
role. Both halves matter: the code discipline is what a reviewer checks, the
grant is what actually holds when the code is wrong.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index,
    Integer, String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# Postgres in deployment, portable JSON everywhere else, so the payment and
# ledger tests run on SQLite in-memory instead of needing a live database.
Json = JSON().with_variant(JSONB, "postgresql")


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Scan(Base):
    __tablename__ = "scan"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    image_key: Mapped[str] = mapped_column(String(512))
    image_sha256: Mapped[str] = mapped_column(String(64), index=True)
    model_version: Mapped[str] = mapped_column(String(128))
    disease_id: Mapped[str | None] = mapped_column(String(128), index=True)
    confidence: Mapped[float | None] = mapped_column()
    top3: Mapped[list] = mapped_column(Json, default=list)
    status: Mapped[str] = mapped_column(String(16))
    gradcam_key: Mapped[str | None] = mapped_column(String(512))
    client_meta: Mapped[dict] = mapped_column(Json, default=dict)

    __table_args__ = (
        CheckConstraint("status in ('ok','uncertain')", name="scan_status_valid"),
        # An uncertain scan must not carry a disease id. The XR module keys off
        # this, and a stray id would let it launch on a guess.
        CheckConstraint(
            "(status = 'ok' and disease_id is not null) or "
            "(status = 'uncertain' and disease_id is null)",
            name="scan_uncertain_has_no_disease",
        ),
    )


class LedgerEntry(Base):
    __tablename__ = "ledger_entry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    seq: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    subject_id: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict] = mapped_column(Json)
    payload_sha256: Mapped[str] = mapped_column(String(64))
    prev_hash: Mapped[str] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64), unique=True)

    __table_args__ = (Index("ix_ledger_seq_desc", seq.desc()),)


class MerkleRoot(Base):
    __tablename__ = "merkle_root"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    day: Mapped[str] = mapped_column(String(10), unique=True, index=True)   # YYYY-MM-DD
    root_hash: Mapped[str] = mapped_column(String(64))
    entry_count: Mapped[int] = mapped_column(Integer)
    anchored_tx: Mapped[str | None] = mapped_column(String(128))


class Product(Base):
    __tablename__ = "product"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sku: Mapped[str] = mapped_column(String(64), unique=True)
    kind: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(256))
    # Integer paise, server-side. The client sends a product_id, never a price.
    price_paise: Mapped[int] = mapped_column(Integer)
    disease_id: Mapped[str | None] = mapped_column(String(128), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        CheckConstraint("kind in ('kit','consult','module')", name="product_kind_valid"),
        CheckConstraint("price_paise > 0", name="product_price_positive"),
    )


class Order(Base):
    __tablename__ = "order"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("product.id"))
    scan_id: Mapped[str | None] = mapped_column(ForeignKey("scan.id"))
    amount_paise: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="created", index=True)
    rzp_order_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    rzp_payment_id: Mapped[str | None] = mapped_column(String(64), index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    product: Mapped[Product] = relationship()

    __table_args__ = (
        CheckConstraint("status in ('created','paid','failed','refunded')",
                        name="order_status_valid"),
    )


class WebhookEvent(Base):
    __tablename__ = "webhook_event"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    # THIS unique constraint is the idempotency mechanism. Razorpay retries, and
    # a replayed event must collide here rather than being handled twice.
    rzp_event_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw: Mapped[dict] = mapped_column(Json)


class Video(Base):
    __tablename__ = "video"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    disease_id: Mapped[str] = mapped_column(String(128), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(256))
    hls_key: Mapped[str] = mapped_column(String(512))
    poster_key: Mapped[str | None] = mapped_column(String(512))
    duration_s: Mapped[int | None] = mapped_column(Integer)
    # Source pixels. The player sizes its panel from these before the video
    # has loaded, so the panel does not jump when metadata arrives.
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    projection: Mapped[str] = mapped_column(String(16), default="flat")
    stereo: Mapped[str] = mapped_column(String(16), default="none")
    language: Mapped[str] = mapped_column(String(8), default="en")

    # Licence obligations travel with the media. Most of this footage is CC BY
    # or CC BY-SA, which REQUIRE attribution -- so it is a column the UI reads,
    # not a note in a README that nobody renders.
    caption: Mapped[str | None] = mapped_column(String(2048))
    license: Mapped[str | None] = mapped_column(String(64))
    attribution: Mapped[str | None] = mapped_column(String(512))
    source_url: Mapped[str | None] = mapped_column(String(1024))
    # Which cycle stage this clip illustrates, so the player can follow the
    # timeline instead of being a separate gallery.
    stage_id: Mapped[str | None] = mapped_column(String(32), index=True)

    __table_args__ = (
        # 'field' is flat field/orchard footage; 'field360' is specifically
        # equirectangular. Folding them together would make the UI label lie
        # about what the viewer is getting.
        CheckConstraint("kind in ('treatment','field','field360','symptom_closeup')",
                        name="video_kind_valid"),
        CheckConstraint("projection in ('flat','equirect','equirect180')",
                        name="video_projection_valid"),
        CheckConstraint("stereo in ('none','top_bottom','left_right')",
                        name="video_stereo_valid"),
    )
