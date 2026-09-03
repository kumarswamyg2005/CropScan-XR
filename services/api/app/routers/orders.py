from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import ledger, payments
from app.config import get_settings
from app.db import get_db
from app.models import Order, Product, Scan
from app.schemas import OrderCreateIn, OrderOut, OrderVerifyIn

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.post("", response_model=OrderOut, status_code=201)
def create_order(body: OrderCreateIn, db: Session = Depends(get_db)) -> OrderOut:
    """Create the Razorpay order server-side.

    The client sends a product_id. The amount is read from the product table and
    never from the request -- a client-supplied price is a free-goods bug.
    """
    product = db.execute(
        select(Product).where(Product.id == body.product_id, Product.active.is_(True))
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(404, "No such product.")

    if body.scan_id and db.get(Scan, body.scan_id) is None:
        raise HTTPException(404, "No such scan.")

    order = Order(
        product_id=product.id,
        scan_id=body.scan_id,
        amount_paise=product.price_paise,
        status="created",
    )
    db.add(order)
    db.flush()

    try:
        remote = payments.create_remote_order(product.price_paise, receipt=order.id)
    except payments.PaymentsNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    order.rzp_order_id = remote["id"]

    ledger.append(db, "order.created", order.id, {
        "order_id": order.id,
        "product_id": product.id,
        "sku": product.sku,
        "scan_id": body.scan_id,
        "amount_paise": product.price_paise,
        "rzp_order_id": remote["id"],
    })
    db.commit()
    db.refresh(order)

    return OrderOut(
        id=order.id, status=order.status, amount_paise=order.amount_paise,
        rzp_order_id=order.rzp_order_id,
        rzp_key_id=get_settings().razorpay_key_id,   # public key, safe to send
        product_title=product.title,
    )


@router.post("/verify", response_model=OrderOut)
def verify_order(body: OrderVerifyIn, db: Session = Depends(get_db)) -> OrderOut:
    """Checkout callback. Verify the signature, then settle.

    This is not the only path to paid -- the webhook can arrive first, or this
    call may never happen because the user closed the tab. Both paths converge
    on mark_paid, which transitions exactly once.
    """
    settings = get_settings()
    if not settings.is_payment_configured:
        raise HTTPException(503, "Payments are not configured.")

    if not payments.verify_payment_signature(
        body.razorpay_order_id, body.razorpay_payment_id,
        body.razorpay_signature, settings.razorpay_key_secret,
    ):
        raise HTTPException(400, "Payment signature verification failed.")

    order = db.execute(
        select(Order).where(Order.rzp_order_id == body.razorpay_order_id)
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(404, "No such order.")

    payments.mark_paid(db, order, body.razorpay_payment_id, source="verify")
    db.commit()
    db.refresh(order)

    return OrderOut(id=order.id, status=order.status, amount_paise=order.amount_paise,
                    rzp_order_id=order.rzp_order_id,
                    product_title=order.product.title if order.product else None)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: str, db: Session = Depends(get_db)) -> OrderOut:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "No such order.")
    return OrderOut(id=order.id, status=order.status, amount_paise=order.amount_paise,
                    rzp_order_id=order.rzp_order_id,
                    product_title=order.product.title if order.product else None)
