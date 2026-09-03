"""Razorpay, test mode only.

All four steps or it is insecure (PRD 4.8):
  1. create the order SERVER-SIDE, never from the client
  2. open Checkout with order_id + the public key_id
  3. verify the signature SERVER-SIDE
  4. handle the webhook independently, verify its signature, make it idempotent

The classic failure is a working checkout with a broken webhook: paid-but-
unfulfilled orders, double charges, refunds that never reverse. Step 4 is not
optional and it is not a duplicate of step 3 -- either one can arrive first, or
step 3 can never arrive at all if the user closes the tab after paying.

Signature verification is a pure function so all six race cases are testable
without touching the network.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import ledger
from app.config import get_settings
from app.models import Order


class PaymentsNotConfigured(RuntimeError):
    pass


def verify_payment_signature(order_id: str, payment_id: str, signature: str,
                             secret: str) -> bool:
    """hmac_sha256(order_id + "|" + payment_id, key_secret).

    compare_digest, not ==, so the comparison does not leak the correct prefix
    through timing.
    """
    expected = hmac.new(
        secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(body: bytes, signature: str, secret: str) -> bool:
    """Razorpay signs the raw request body. It must be the exact bytes received:
    re-serialising the parsed JSON changes whitespace and the signature fails."""
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def create_remote_order(amount_paise: int, receipt: str) -> dict:
    settings = get_settings()
    if not settings.is_payment_configured:
        raise PaymentsNotConfigured("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set")
    if not settings.razorpay_key_id.startswith("rzp_test_"):
        raise PaymentsNotConfigured(
            "Refusing to run against a live Razorpay key. This build is test mode only."
        )

    import razorpay

    client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    return client.order.create({
        "amount": amount_paise,      # integer paise, from the product table
        "currency": "INR",
        "receipt": receipt,
        "payment_capture": 1,
    })


def mark_paid(db: Session, order: Order, payment_id: str, source: str) -> bool:
    """Move an order to paid exactly once, whichever path arrives first.

    Returns True if this call did the transition, False if it was already paid.
    The ledger entry is written in the caller's transaction, so an order cannot
    be marked paid without its ledger record.
    """
    if order.status == "paid":
        return False
    if order.status == "refunded":
        raise ValueError(f"order {order.id} is refunded; refusing to mark it paid")

    order.status = "paid"
    order.rzp_payment_id = payment_id
    order.paid_at = datetime.now(timezone.utc)

    ledger.append(db, "order.paid", order.id, {
        "order_id": order.id,
        "product_id": order.product_id,
        "scan_id": order.scan_id,
        "amount_paise": order.amount_paise,
        "rzp_order_id": order.rzp_order_id,
        "rzp_payment_id": payment_id,
        "settled_via": source,          # "verify" or "webhook"
    })
    return True


def mark_refunded(db: Session, order: Order, refund_id: str) -> bool:
    if order.status == "refunded":
        return False
    order.status = "refunded"
    ledger.append(db, "order.refunded", order.id, {
        "order_id": order.id,
        "amount_paise": order.amount_paise,
        "rzp_payment_id": order.rzp_payment_id,
        "rzp_refund_id": refund_id,
    })
    return True
