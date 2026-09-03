"""API response shapes. Pydantic v2."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TopK(BaseModel):
    disease_id: str
    confidence: float


class ScanOut(BaseModel):
    id: str
    created_at: datetime
    status: str
    disease_id: str | None
    confidence: float | None
    top3: list[TopK]
    model_version: str
    image_url: str | None = None
    gradcam_url: str | None = None
    info: dict | None = None
    has_cycle: bool = False
    # The XR module refuses to launch on an uncertain scan, and the button needs
    # a reason to show. Computed server-side so the two surfaces cannot disagree.
    can_enter_field: bool = False
    field_blocked_reason: str | None = None


class DiseaseSummary(BaseModel):
    id: str
    name: str
    plant: str
    is_healthy: bool
    severity: str | None = None
    has_cycle: bool
    has_video: bool


class DiseaseDetail(DiseaseSummary):
    symptoms: str | None = None
    organic: str | None = None
    chemical: str | None = None
    prevention: str | None = None
    cycle: dict | None = None
    videos: list[VideoOut] = []


class VideoOut(BaseModel):
    id: str
    disease_id: str
    kind: str
    title: str
    hls_url: str | None
    poster_url: str | None
    duration_s: int | None
    projection: str
    stereo: str
    language: str


class LedgerEntryOut(BaseModel):
    id: str
    seq: int
    created_at: datetime
    event_type: str
    subject_id: str
    payload: dict
    payload_sha256: str
    prev_hash: str
    entry_hash: str


class LedgerVerifyOut(BaseModel):
    ok: bool
    checked: int
    head_hash: str | None = None
    first_break: dict | None = None


class OrderCreateIn(BaseModel):
    # A product id, never a price. Amounts come from the product table.
    product_id: str
    scan_id: str | None = None


class OrderOut(BaseModel):
    id: str
    status: str
    amount_paise: int
    currency: str = "INR"
    rzp_order_id: str | None
    rzp_key_id: str | None = None
    product_title: str | None = None


class OrderVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class HealthOut(BaseModel):
    status: str
    model_loaded: bool
    model_version: str | None
    db_reachable: bool
    storage_reachable: bool
    cycles_loaded: int


DiseaseDetail.model_rebuild()
