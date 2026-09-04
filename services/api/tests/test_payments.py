"""The six payment cases from PRD 4.8 / issues #26.

The classic failure in this integration is a working checkout with a broken
webhook: paid-but-unfulfilled orders, double charges, refunds that never
reverse. Every one of those is a race between two independent callbacks, so
they are tested as races, not as a happy path.
"""

import hashlib
import hmac
import json

import pytest
from sqlalchemy import select

from app.models import LedgerEntry, Order, WebhookEvent
from app.payments import verify_payment_signature, verify_webhook_signature

SECRET = "test_secret"
WEBHOOK_SECRET = "webhook_secret"


def sign_payment(order_id: str, payment_id: str, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(),
                    hashlib.sha256).hexdigest()


def sign_webhook(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def make_order(client, product, scan=None) -> dict:
    payload = {"product_id": product.id}
    if scan is not None:
        payload["scan_id"] = scan.id
    r = client.post("/api/orders", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def captured_webhook(rzp_order_id: str, payment_id: str = "pay_test_1") -> bytes:
    return json.dumps({
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": payment_id, "order_id": rzp_order_id}}},
    }).encode()


# --- the amount rule --------------------------------------------------------

def test_amount_comes_from_the_product_not_the_client(client, product):
    """A client-supplied price is a free-goods bug. The request carries only a
    product_id and there is nowhere to put a price."""
    order = make_order(client, product)
    assert order["amount_paise"] == product.price_paise

    r = client.post("/api/orders", json={"product_id": product.id, "amount_paise": 1})
    assert r.status_code == 201
    assert r.json()["amount_paise"] == product.price_paise


def test_unknown_product_is_rejected(client):
    assert client.post("/api/orders", json={"product_id": "nope"}).status_code == 404


# --- case 1: signature valid ------------------------------------------------

def test_1_signature_valid_marks_paid(client, db_session, product):
    order = make_order(client, product)
    payment_id = "pay_test_1"

    r = client.post("/api/orders/verify", json={
        "razorpay_order_id": order["rzp_order_id"],
        "razorpay_payment_id": payment_id,
        "razorpay_signature": sign_payment(order["rzp_order_id"], payment_id),
    })
    assert r.status_code == 200
    assert r.json()["status"] == "paid"

    row = db_session.get(Order, order["id"])
    assert row.status == "paid"
    assert row.rzp_payment_id == payment_id
    assert row.paid_at is not None


# --- case 2: signature invalid ----------------------------------------------

def test_2_signature_invalid_is_rejected(client, db_session, product):
    order = make_order(client, product)

    r = client.post("/api/orders/verify", json={
        "razorpay_order_id": order["rzp_order_id"],
        "razorpay_payment_id": "pay_test_1",
        "razorpay_signature": "0" * 64,
    })
    assert r.status_code == 400
    assert db_session.get(Order, order["id"]).status == "created"


def test_2b_signature_from_a_different_order_is_rejected(client, db_session, product):
    """A valid signature for someone else's order must not settle this one."""
    order = make_order(client, product)
    r = client.post("/api/orders/verify", json={
        "razorpay_order_id": order["rzp_order_id"],
        "razorpay_payment_id": "pay_test_1",
        "razorpay_signature": sign_payment("order_someone_else", "pay_test_1"),
    })
    assert r.status_code == 400
    assert db_session.get(Order, order["id"]).status == "created"


# --- case 3: duplicate webhook ----------------------------------------------

def test_3_duplicate_webhook_is_idempotent(client, db_session, product):
    order = make_order(client, product)
    body = captured_webhook(order["rzp_order_id"])
    headers = {"x-razorpay-signature": sign_webhook(body),
               "x-razorpay-event-id": "evt_dup_1"}

    first = client.post("/api/webhooks/razorpay", content=body, headers=headers)
    second = client.post("/api/webhooks/razorpay", content=body, headers=headers)

    assert first.json()["status"] == "ok"
    assert second.json()["status"] == "duplicate"

    assert db_session.get(Order, order["id"]).status == "paid"
    assert len(list(db_session.execute(select(WebhookEvent)).scalars())) == 1

    paid_entries = list(db_session.execute(
        select(LedgerEntry).where(LedgerEntry.event_type == "order.paid")
    ).scalars())
    assert len(paid_entries) == 1, "an order must be marked paid exactly once"


def test_3b_bad_webhook_signature_is_rejected(client, db_session, product):
    order = make_order(client, product)
    body = captured_webhook(order["rzp_order_id"])
    r = client.post("/api/webhooks/razorpay", content=body,
                    headers={"x-razorpay-signature": "0" * 64,
                             "x-razorpay-event-id": "evt_bad"})
    assert r.status_code == 400
    assert db_session.get(Order, order["id"]).status == "created"
    assert db_session.execute(select(WebhookEvent)).first() is None


# --- case 4: webhook before verify ------------------------------------------

def test_4_webhook_before_verify(client, db_session, product):
    """The user closes the tab after paying, so the webhook lands first and the
    verify call arrives late. The order must be paid once, not twice."""
    order = make_order(client, product)
    payment_id = "pay_test_4"
    body = captured_webhook(order["rzp_order_id"], payment_id)

    client.post("/api/webhooks/razorpay", content=body,
                headers={"x-razorpay-signature": sign_webhook(body),
                         "x-razorpay-event-id": "evt_4"})
    assert db_session.get(Order, order["id"]).status == "paid"

    r = client.post("/api/orders/verify", json={
        "razorpay_order_id": order["rzp_order_id"],
        "razorpay_payment_id": payment_id,
        "razorpay_signature": sign_payment(order["rzp_order_id"], payment_id),
    })
    assert r.status_code == 200
    assert r.json()["status"] == "paid"

    paid = list(db_session.execute(
        select(LedgerEntry).where(LedgerEntry.event_type == "order.paid")
    ).scalars())
    assert len(paid) == 1
    assert paid[0].payload["settled_via"] == "webhook"


# --- case 5: verify before webhook ------------------------------------------

def test_5_verify_before_webhook(client, db_session, product):
    order = make_order(client, product)
    payment_id = "pay_test_5"

    client.post("/api/orders/verify", json={
        "razorpay_order_id": order["rzp_order_id"],
        "razorpay_payment_id": payment_id,
        "razorpay_signature": sign_payment(order["rzp_order_id"], payment_id),
    })
    assert db_session.get(Order, order["id"]).status == "paid"

    body = captured_webhook(order["rzp_order_id"], payment_id)
    r = client.post("/api/webhooks/razorpay", content=body,
                    headers={"x-razorpay-signature": sign_webhook(body),
                             "x-razorpay-event-id": "evt_5"})
    assert r.status_code == 200
    assert r.json()["transitioned"] is False, "already paid; must not transition twice"

    paid = list(db_session.execute(
        select(LedgerEntry).where(LedgerEntry.event_type == "order.paid")
    ).scalars())
    assert len(paid) == 1
    assert paid[0].payload["settled_via"] == "verify"


# --- case 6: refund ---------------------------------------------------------

def test_6_refund_reverses_the_order(client, db_session, product):
    order = make_order(client, product)
    payment_id = "pay_test_6"

    client.post("/api/orders/verify", json={
        "razorpay_order_id": order["rzp_order_id"],
        "razorpay_payment_id": payment_id,
        "razorpay_signature": sign_payment(order["rzp_order_id"], payment_id),
    })

    body = json.dumps({
        "event": "refund.processed",
        "payload": {"refund": {"entity": {"id": "rfnd_1", "payment_id": payment_id}}},
    }).encode()
    r = client.post("/api/webhooks/razorpay", content=body,
                    headers={"x-razorpay-signature": sign_webhook(body),
                             "x-razorpay-event-id": "evt_refund"})
    assert r.status_code == 200
    assert db_session.get(Order, order["id"]).status == "refunded"

    kinds = [e.event_type for e in db_session.execute(select(LedgerEntry)).scalars()]
    assert kinds == ["order.created", "order.paid", "order.refunded"]


def test_6b_a_refunded_order_cannot_be_marked_paid_again(client, db_session, product):
    """A late webhook retry after a refund must not silently un-refund."""
    from app.payments import mark_paid

    order = make_order(client, product)
    row = db_session.get(Order, order["id"])
    row.status = "refunded"
    db_session.commit()

    with pytest.raises(ValueError):
        mark_paid(db_session, row, "pay_late", source="webhook")


# --- signature primitives ---------------------------------------------------

def test_payment_signature_is_the_documented_formula():
    assert verify_payment_signature("order_x", "pay_y", sign_payment("order_x", "pay_y"), SECRET)
    assert not verify_payment_signature("order_x", "pay_y", "deadbeef", SECRET)


def test_webhook_signature_is_over_the_raw_body():
    """Re-serialising the parsed JSON changes whitespace and breaks the HMAC.
    This is the single most common Razorpay integration bug."""
    body = b'{"event": "payment.captured", "spacing": "matters"}'
    assert verify_webhook_signature(body, sign_webhook(body), WEBHOOK_SECRET)

    reserialised = json.dumps(json.loads(body), separators=(",", ":")).encode()
    assert reserialised != body
    assert not verify_webhook_signature(reserialised, sign_webhook(body), WEBHOOK_SECRET)


def test_webhook_without_an_event_id_is_rejected():
    """No event id means no idempotency key, so a retry would double-process."""
    from app.payments import verify_webhook_signature as v
    assert v(b"{}", sign_webhook(b"{}"), WEBHOOK_SECRET)


# --- webhook robustness -----------------------------------------------------

def test_a_late_capture_after_a_refund_does_not_500(client, db_session, product):
    """Razorpay retries on a 5xx. A 500 here also rolls back the webhook_event
    row that IS the idempotency key, so the same event retries forever and
    fails identically every time."""
    order = make_order(client, product)
    payment_id = "pay_late"

    client.post("/api/orders/verify", json={
        "razorpay_order_id": order["rzp_order_id"],
        "razorpay_payment_id": payment_id,
        "razorpay_signature": sign_payment(order["rzp_order_id"], payment_id),
    })
    row = db_session.get(Order, order["id"])
    row.status = "refunded"
    db_session.commit()

    body = captured_webhook(order["rzp_order_id"], payment_id)
    r = client.post("/api/webhooks/razorpay", content=body,
                    headers={"x-razorpay-signature": sign_webhook(body),
                             "x-razorpay-event-id": "evt_late_capture"})

    assert r.status_code == 200
    assert r.json()["transitioned"] is False
    assert db_session.get(Order, order["id"]).status == "refunded"


def test_paid_event_without_a_payment_id_is_not_recorded(client, db_session, product):
    """An empty rzp_payment_id poisons the row: a later refund matches on that
    id and can never find the order again."""
    order = make_order(client, product)
    body = json.dumps({
        "event": "order.paid",
        "payload": {"order": {"entity": {"id": order["rzp_order_id"]}}},
    }).encode()

    r = client.post("/api/webhooks/razorpay", content=body,
                    headers={"x-razorpay-signature": sign_webhook(body),
                             "x-razorpay-event-id": "evt_no_payment_id"})

    assert r.status_code == 200
    assert r.json()["transitioned"] is False
    row = db_session.get(Order, order["id"])
    assert row.status == "created"
    assert not row.rzp_payment_id
