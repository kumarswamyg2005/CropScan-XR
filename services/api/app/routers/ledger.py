from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import ledger as chain
from app.db import get_db
from app.models import LedgerEntry, MerkleRoot
from app.schemas import LedgerEntryOut, LedgerVerifyOut

router = APIRouter(prefix="/api/ledger", tags=["ledger"])


@router.get("", response_model=list[LedgerEntryOut])
def read_ledger(
    since_seq: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[LedgerEntry]:
    return chain.read_entries(db, since_seq=since_seq, limit=limit)


@router.get("/verify", response_model=LedgerVerifyOut)
def verify(db: Session = Depends(get_db)) -> LedgerVerifyOut:
    """Recompute the whole chain and report the first broken link.

    This endpoint is the entire justification for the subsystem. docs/demo.md
    tampers one payload in psql and shows this catching it.
    """
    return LedgerVerifyOut(**chain.verify_whole_chain(db))


@router.get("/roots")
def list_roots(db: Session = Depends(get_db)) -> list[dict]:
    roots = db.execute(select(MerkleRoot).order_by(MerkleRoot.day.desc())).scalars()
    return [
        {"day": r.day, "root_hash": r.root_hash, "entry_count": r.entry_count,
         "anchored_tx": r.anchored_tx}
        for r in roots
    ]


@router.post("/roots/build")
def build_root(
    day: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
) -> dict:
    """On-demand root build. The same code a nightly job calls."""
    record = chain.build_daily_root(db, day)
    if record is None:
        raise HTTPException(404, "No ledger entries for that day.")
    db.commit()
    return {"day": record.day, "root_hash": record.root_hash,
            "entry_count": record.entry_count}


@router.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict:
    total = db.execute(select(func.count(LedgerEntry.id))).scalar_one()
    head = db.execute(
        select(LedgerEntry).order_by(LedgerEntry.seq.desc()).limit(1)
    ).scalar_one_or_none()
    return {
        "entries": total,
        "head_seq": head.seq if head else 0,
        "head_hash": head.entry_hash if head else chain.GENESIS_HASH,
    }


@router.get("/{entry_id}/proof")
def proof(entry_id: str, db: Session = Depends(get_db)) -> dict:
    """Merkle inclusion proof for one entry, verifiable by anyone."""
    result = chain.inclusion_proof(db, entry_id)
    if result is None:
        raise HTTPException(404, "No such ledger entry.")
    return result
