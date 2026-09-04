"""Hash-chained append-only ledger with daily Merkle roots.

Why this and not Fabric or a public chain: the demonstrable property people
actually want from "blockchain agriculture" is an immutable, auditable event
record with tamper-evidence you can prove live. A hash chain in Postgres gives
that at a fraction of the complexity, and the trade-off is defensible. See
docs/adr/0001-hash-chained-ledger.md.

    entry_hash = sha256(seq || created_at_iso || event_type || subject_id
                        || payload_sha256 || prev_hash)

prev_hash of entry n is entry_hash of n-1. Genesis uses 64 zeros.

The chain maths lives in module-level pure functions so it can be tested
exhaustively without a database. The DB layer below is deliberately thin.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import LedgerEntry, MerkleRoot

GENESIS_HASH = "0" * 64
FIELD_SEPARATOR = "|"

EVENT_TYPES = {
    "scan.created", "scan.uncertain", "order.created", "order.paid",
    "order.refunded", "consult.booked", "module.unlocked",
}

# Advisory lock id for serialising appends. Arbitrary but fixed.
_APPEND_LOCK_ID = 0x1ED6E4


# --------------------------------------------------------------------------
# Pure functions. No database, no clock, no I/O.
# --------------------------------------------------------------------------

def canonical_json(payload: Any) -> str:
    """Byte-stable JSON. Key order and separators are pinned because the hash
    is taken over this string -- if serialisation drifts, every historical
    entry stops verifying and it looks like tampering."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, default=str)


def payload_hash(payload: Any) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def _iso_utc(dt: datetime) -> str:
    """Timestamp exactly as it goes into the hash.

    A naive datetime is treated as UTC rather than local time. This matters:
    several drivers return a naive datetime for a column that was written
    timezone-aware, and .astimezone() on a naive value silently assumes the
    server's local zone. The hash would then depend on where the process runs,
    and a clean chain would fail verification after a timezone change -- looking
    exactly like tampering.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def compute_entry_hash(
    seq: int,
    created_at: datetime,
    event_type: str,
    subject_id: str,
    payload_sha256: str,
    prev_hash: str,
) -> str:
    parts = [
        str(seq),
        _iso_utc(created_at),
        event_type,
        subject_id,
        payload_sha256,
        prev_hash,
    ]
    return hashlib.sha256(FIELD_SEPARATOR.join(parts).encode("utf-8")).hexdigest()


def entry_hash_of(entry) -> str:
    """Recompute an entry's hash from its own stored fields."""
    return compute_entry_hash(
        entry.seq, entry.created_at, entry.event_type,
        entry.subject_id, entry.payload_sha256, entry.prev_hash,
    )


def verify_chain(entries: Sequence) -> dict:
    """Walk the chain and report the FIRST break.

    Three ways to break, all caught:
      * payload edited      -> payload_sha256 no longer matches the payload
      * stored hash edited  -> entry_hash no longer matches the recomputed one
      * entry deleted or reordered -> prev_hash does not match the predecessor
    """
    prev = GENESIS_HASH
    expected_seq = None

    for entry in entries:
        if expected_seq is None:
            expected_seq = entry.seq
        elif entry.seq != expected_seq:
            return _break(entry, "sequence_gap",
                          f"expected seq {expected_seq}, found {entry.seq}. "
                          f"An entry was deleted or the chain was reordered.")

        if payload_hash(entry.payload) != entry.payload_sha256:
            return _break(entry, "payload_modified",
                          "The stored payload no longer hashes to payload_sha256. "
                          "This row's contents were edited after it was written.")

        if entry.prev_hash != prev:
            return _break(entry, "broken_link",
                          f"prev_hash points at {entry.prev_hash[:12]}... but the "
                          f"preceding entry hashes to {prev[:12]}...")

        recomputed = entry_hash_of(entry)
        if recomputed != entry.entry_hash:
            return _break(entry, "hash_mismatch",
                          "entry_hash does not match the recomputed hash of this "
                          "row's own fields.")

        prev = entry.entry_hash
        expected_seq = entry.seq + 1

    return {"ok": True, "checked": len(entries), "first_break": None,
            "head_hash": prev if entries else GENESIS_HASH}


def _break(entry, reason: str, detail: str) -> dict:
    return {
        "ok": False,
        "first_break": {
            "id": entry.id,
            "seq": entry.seq,
            "event_type": entry.event_type,
            "subject_id": entry.subject_id,
            "reason": reason,
            "detail": detail,
        },
    }


def merkle_root(leaves: Sequence[str]) -> str:
    """Merkle root over the day's entry hashes.

    An odd node is PROMOTED unchanged rather than duplicated. Duplicating it --
    the Bitcoin approach -- makes two different leaf sets produce the same root
    (CVE-2012-2459), which would let someone forge an inclusion proof. Promotion
    is what Certificate Transparency does and it has no such ambiguity.
    """
    if not leaves:
        return GENESIS_HASH
    level = list(leaves)
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level) - 1, 2):
            nxt.append(_pair(level[i], level[i + 1]))
        if len(level) % 2:
            nxt.append(level[-1])
        level = nxt
    return level[0]


def _pair(left: str, right: str) -> str:
    return hashlib.sha256((left + right).encode("utf-8")).hexdigest()


def merkle_proof(leaves: Sequence[str], index: int) -> list[dict]:
    """Sibling path proving `leaves[index]` is under the root."""
    if not 0 <= index < len(leaves):
        raise IndexError(index)
    proof: list[dict] = []
    level = list(leaves)
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level) - 1, 2):
            if i == index:
                proof.append({"side": "right", "hash": level[i + 1]})
            elif i + 1 == index:
                proof.append({"side": "left", "hash": level[i]})
            nxt.append(_pair(level[i], level[i + 1]))
        if len(level) % 2:
            nxt.append(level[-1])
            # A promoted node gets no sibling at this level.
        index //= 2
        level = nxt
    return proof


def verify_merkle_proof(leaf: str, proof: Iterable[dict], root: str) -> bool:
    node = leaf
    for step in proof:
        node = _pair(step["hash"], node) if step["side"] == "left" else _pair(node, step["hash"])
    return node == root


# --------------------------------------------------------------------------
# Database layer. Append only -- there is no update and no delete here.
# --------------------------------------------------------------------------

def append(db: Session, event_type: str, subject_id: str, payload: dict) -> LedgerEntry:
    """Append one entry. Caller controls the transaction, so a ledger write can
    be committed atomically with the business row that caused it.

    ponytail: a Postgres transaction-scoped advisory lock serialises appends.
    The chain is inherently sequential, so a global lock costs nothing at this
    scale and removes every interleaving bug. If append throughput ever becomes
    the bottleneck, the upgrade is batching within one lock hold, not finer
    locks -- the chain cannot be sharded without giving up its one property.
    """
    if event_type not in EVENT_TYPES:
        raise ValueError(f"unknown ledger event type {event_type!r}")

    if db.bind.dialect.name == "postgresql":
        db.execute(text("select pg_advisory_xact_lock(:k)"), {"k": _APPEND_LOCK_ID})

    tail = db.execute(
        select(LedgerEntry).order_by(LedgerEntry.seq.desc()).limit(1)
    ).scalar_one_or_none()

    seq = 1 if tail is None else tail.seq + 1
    prev_hash = GENESIS_HASH if tail is None else tail.entry_hash
    created_at = datetime.now(timezone.utc)
    p_hash = payload_hash(payload)

    entry = LedgerEntry(
        seq=seq,
        created_at=created_at,
        event_type=event_type,
        subject_id=subject_id,
        payload=payload,
        payload_sha256=p_hash,
        prev_hash=prev_hash,
        entry_hash=compute_entry_hash(seq, created_at, event_type, subject_id,
                                      p_hash, prev_hash),
    )
    db.add(entry)
    db.flush()
    return entry


def read_entries(db: Session, since_seq: int = 0, limit: int = 100) -> list[LedgerEntry]:
    return list(db.execute(
        select(LedgerEntry)
        .where(LedgerEntry.seq > since_seq)
        .order_by(LedgerEntry.seq)
        .limit(limit)
    ).scalars())


def verify_whole_chain(db: Session) -> dict:
    """Recompute the entire chain. Streams in batches so a long chain does not
    have to fit in memory."""
    prev = GENESIS_HASH
    expected_seq = None
    checked = 0
    batch = 1000
    cursor = 0

    while True:
        rows = read_entries(db, since_seq=cursor, limit=batch)
        if not rows:
            break
        result = _verify_batch(rows, prev, expected_seq)
        checked += result["checked"]
        if not result["ok"]:
            # _verify_batch reports 0 checked on failure, so add the entries it
            # walked before the break -- otherwise a break at seq 900 of the
            # first batch claimed "0 entries checked" and understated the
            # evidence behind the failure.
            checked += result.get("checked_before_break", 0)
            result["checked"] = checked
            return result
        prev = result["head_hash"]
        expected_seq = result["next_seq"]
        cursor = rows[-1].seq

    return {"ok": True, "checked": checked, "first_break": None, "head_hash": prev}


def _verify_batch(rows: Sequence[LedgerEntry], prev: str, expected_seq: int | None) -> dict:
    walked = 0
    for entry in rows:
        if expected_seq is not None and entry.seq != expected_seq:
            out = _break(entry, "sequence_gap",
                         f"expected seq {expected_seq}, found {entry.seq}. "
                         f"An entry was deleted or the chain was reordered.")
            out["checked"] = 0
            out["checked_before_break"] = walked
            return out
        if payload_hash(entry.payload) != entry.payload_sha256:
            out = _break(entry, "payload_modified",
                         "The stored payload no longer hashes to payload_sha256. "
                         "This row's contents were edited after it was written.")
            out["checked"] = 0
            out["checked_before_break"] = walked
            return out
        if entry.prev_hash != prev:
            out = _break(entry, "broken_link",
                         f"prev_hash points at {entry.prev_hash[:12]}... but the "
                         f"preceding entry hashes to {prev[:12]}...")
            out["checked"] = 0
            out["checked_before_break"] = walked
            return out
        if entry_hash_of(entry) != entry.entry_hash:
            out = _break(entry, "hash_mismatch",
                         "entry_hash does not match the recomputed hash of this "
                         "row's own fields.")
            out["checked"] = 0
            out["checked_before_break"] = walked
            return out
        prev = entry.entry_hash
        expected_seq = entry.seq + 1
        walked += 1

    return {"ok": True, "checked": len(rows), "head_hash": prev,
            "next_seq": expected_seq, "first_break": None}


def _day_leaves(db: Session, day: str) -> list[LedgerEntry]:
    """Entries belonging to one UTC day.

    A half-open range on the timestamp, not func.date(). On a timestamptz
    Postgres converts in the SESSION TimeZone, so func.date() would bucket by
    the server's local day while utc_day() bucketed by UTC -- entries landing in
    the wrong daily root, and a root rebuilt later under a different TimeZone
    changing hash, which reads as tampering. The range is also portable to
    SQLite and can use the created_at index.
    """
    start = datetime.fromisoformat(day).replace(tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return list(db.execute(
        select(LedgerEntry)
        .where(LedgerEntry.created_at >= start, LedgerEntry.created_at < end)
        .order_by(LedgerEntry.seq)
    ).scalars())


def utc_day(moment: datetime | None = None) -> str:
    """The day a ledger entry belongs to, in UTC.

    Must be UTC, not date.today(). created_at is stored in UTC and _day_leaves
    compares against that stored value, so a server in any other timezone would
    look for the wrong day for part of every day -- in India, five and a half
    hours of it -- and build an empty root while entries were being written.
    Silently.
    """
    return (moment or datetime.now(timezone.utc)).astimezone(timezone.utc).date().isoformat()


def build_daily_root(db: Session, day: str | None = None) -> MerkleRoot | None:
    """Build (or rebuild) the Merkle root for one day. Idempotent."""
    day = day or utc_day()
    entries = _day_leaves(db, day)
    if not entries:
        return None

    root = merkle_root([e.entry_hash for e in entries])
    existing = db.execute(
        select(MerkleRoot).where(MerkleRoot.day == day)
    ).scalar_one_or_none()

    if existing:
        # A root is derived data, not ledger data, so recomputing it is allowed.
        # A CHANGED root for a past day means the underlying entries moved.
        existing.root_hash = root
        existing.entry_count = len(entries)
        return existing

    record = MerkleRoot(day=day, root_hash=root, entry_count=len(entries))
    db.add(record)
    db.flush()
    return record


def inclusion_proof(db: Session, entry_id: str) -> dict | None:
    entry = db.get(LedgerEntry, entry_id)
    if entry is None:
        return None

    day = utc_day(entry.created_at if entry.created_at.tzinfo
                  else entry.created_at.replace(tzinfo=timezone.utc))
    entries = _day_leaves(db, day)
    leaves = [e.entry_hash for e in entries]
    index = next((i for i, e in enumerate(entries) if e.id == entry.id), None)
    if index is None:
        # The entry exists but is not among its own day's leaves. A bare next()
        # raised StopIteration here, which FastAPI surfaces as a 500 with no
        # explanation; the timezone bug above was one way to reach it.
        return None

    record = db.execute(select(MerkleRoot).where(MerkleRoot.day == day)).scalar_one_or_none()
    return {
        "entry_id": entry.id,
        "seq": entry.seq,
        "day": day,
        "leaf": entry.entry_hash,
        "index": index,
        "proof": merkle_proof(leaves, index),
        "root": merkle_root(leaves),
        "anchored_root": record.root_hash if record else None,
        "anchored_tx": record.anchored_tx if record else None,
    }
