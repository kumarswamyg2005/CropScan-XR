from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import payments
from app.config import get_settings
from app.db import get_db
from app.models import Order, WebhookEvent

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(default=""),
    x_razorpay_event_id: str = Header(default=""),
    db: Session = Depends(get_db),
) -> dict:
    """Independent of the verify path, signature-verified, idempotent.

    Idempotency is the unique constraint on webhook_event.rzp_event_id, not an
    in-code check. Razorpay retries, and two retries can arrive concurrently --
    a SELECT-then-INSERT would let both through. Letting the INSERT collide is
    the only version that holds under concurrency.
    """
    settings = get_settings()
    if not settings.razorpay_webhook_secret:
        raise HTTPException(503, "Webhook secret is not configured.")

    # The raw bytes, not the re-serialised JSON. Whitespace differences break
    # the HMAC and this is the single most common integration bug.
    raw = await request.body()

    if not payments.verify_webhook_signature(
        raw, x_razorpay_signature, settings.razorpay_webhook_secret
    ):
        raise HTTPException(400, "Webhook signature verification failed.")

    import json

    body = json.loads(raw)
    event_type = body.get("event", "")
    event_id = x_razorpay_event_id or body.get("id") or ""
    if not event_id:
        raise HTTPException(400, "Webhook is missing an event id.")

    record = WebhookEvent(rzp_event_id=event_id, event_type=event_type, raw=body)
    db.add(record)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicate", "event_id": event_id}

    handled = _handle(db, event_type, body)
    record.processed_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok", "event": event_type, **handled}


def _handle(db: Session, event_type: str, body: dict) -> dict:
    entity = body.get("payload", {})

    if event_type in {"payment.captured", "order.paid"}:
        payment = entity.get("payment", {}).get("entity", {})
        rzp_order_id = payment.get("order_id") or entity.get("order", {}).get("entity", {}).get("id")
        order = _find_order(db, rzp_order_id)
        if order is None:
            # The webhook can legitimately beat our own order row in a race, or
            # belong to another environment sharing the test account. Recorded,
            # not fatal -- a 500 here makes Razorpay retry forever.
            return {"matched": False, "reason": "no local order for that rzp_order_id"}

        payment_id = payment.get("id")
        if not payment_id:
            # An order.paid event can arrive with no payment entity. Storing ""
            # as rzp_payment_id used to poison the row permanently: a later
            # refund matches on that id and could never find this order again,
            # and the ledger payload recorded a payment that has no identifier.
            return {"matched": True, "order_id": order.id, "transitioned": False,
                    "reason": "event carried no payment id"}

        try:
            changed = payments.mark_paid(db, order, payment_id, source="webhook")
        except ValueError as exc:
            # Refunded already. Raising here 500s the handler, which rolls back
            # the webhook_event row that IS the idempotency key -- so Razorpay
            # retries the same event forever, and each retry 500s again.
            return {"matched": True, "order_id": order.id, "transitioned": False,
                    "reason": str(exc)}
        return {"matched": True, "order_id": order.id, "transitioned": changed}

    if event_type in {"payment.failed"}:
        payment = entity.get("payment", {}).get("entity", {})
        order = _find_order(db, payment.get("order_id"))
        if order and order.status == "created":
            order.status = "failed"
        return {"matched": order is not None}

    if event_type in {"refund.created", "refund.processed"}:
        refund = entity.get("refund", {}).get("entity", {})
        payment_id = refund.get("payment_id")
        order = db.execute(
            select(Order).where(Order.rzp_payment_id == payment_id)
        ).scalar_one_or_none() if payment_id else None
        if order is None:
            return {"matched": False}
        changed = payments.mark_refunded(db, order, refund.get("id", ""))
        return {"matched": True, "order_id": order.id, "transitioned": changed}

    return {"matched": False, "reason": "event type not handled"}


def _find_order(db: Session, rzp_order_id: str | None) -> Order | None:
    if not rzp_order_id:
        return None
    return db.execute(
        select(Order).where(Order.rzp_order_id == rzp_order_id)
    ).scalar_one_or_none()
