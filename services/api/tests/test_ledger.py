"""Ledger chain maths and tamper detection.

The whole justification for this subsystem is a five-second live demo: edit one
payload in psql, hit /api/ledger/verify, watch it name the broken entry. If
these tests do not hold, that demo is theatre.

Pure functions only -- no database needed, so this runs anywhere.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import pytest

from app.ledger import (
    GENESIS_HASH,
    utc_day,
    canonical_json,
    compute_entry_hash,
    entry_hash_of,
    merkle_proof,
    merkle_root,
    payload_hash,
    verify_chain,
    verify_merkle_proof,
)

T0 = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


@dataclass
class FakeEntry:
    """Stands in for a LedgerEntry row. Same attribute names the real code reads."""
    seq: int
    created_at: datetime
    event_type: str
    subject_id: str
    payload: dict
    payload_sha256: str = ""
    prev_hash: str = ""
    entry_hash: str = ""
    id: str = field(default="")

    def __post_init__(self):
        self.id = self.id or f"entry-{self.seq}"


def build_chain(n: int = 5) -> list[FakeEntry]:
    entries: list[FakeEntry] = []
    prev = GENESIS_HASH
    for i in range(1, n + 1):
        payload = {"scan_id": f"s{i}", "disease_id": "Apple___Apple_scab", "confidence": 0.9}
        e = FakeEntry(
            seq=i,
            created_at=T0 + timedelta(minutes=i),
            event_type="scan.created",
            subject_id=f"s{i}",
            payload=payload,
        )
        e.payload_sha256 = payload_hash(payload)
        e.prev_hash = prev
        e.entry_hash = compute_entry_hash(e.seq, e.created_at, e.event_type,
                                          e.subject_id, e.payload_sha256, e.prev_hash)
        prev = e.entry_hash
        entries.append(e)
    return entries


# --- canonicalisation -------------------------------------------------------

def test_canonical_json_is_key_order_independent():
    """The hash is taken over this string. If key order leaked in, every entry
    would stop verifying after an unrelated refactor and it would look like
    tampering."""
    assert canonical_json({"a": 1, "b": 2}) == canonical_json({"b": 2, "a": 1})


def test_canonical_json_has_no_incidental_whitespace():
    assert " " not in canonical_json({"a": 1, "b": [1, 2]})


def test_payload_hash_changes_with_content():
    assert payload_hash({"a": 1}) != payload_hash({"a": 2})


# --- the happy chain --------------------------------------------------------

def test_clean_chain_verifies():
    result = verify_chain(build_chain())
    assert result["ok"]
    assert result["checked"] == 5
    assert result["first_break"] is None


def test_empty_chain_verifies_to_genesis():
    result = verify_chain([])
    assert result["ok"]
    assert result["head_hash"] == GENESIS_HASH


def test_first_entry_links_to_genesis():
    assert build_chain(1)[0].prev_hash == GENESIS_HASH


def test_each_entry_links_to_its_predecessor():
    chain = build_chain(4)
    for prev, cur in zip(chain, chain[1:]):
        assert cur.prev_hash == prev.entry_hash


# --- the four ways to tamper ------------------------------------------------

def test_edited_payload_is_caught():
    """The live demo: UPDATE ledger_entry SET payload = ... in psql."""
    chain = build_chain()
    chain[2].payload = {"scan_id": "s3", "disease_id": "Tomato___healthy", "confidence": 0.99}

    result = verify_chain(chain)
    assert not result["ok"]
    assert result["first_break"]["seq"] == 3
    assert result["first_break"]["reason"] == "payload_modified"


def test_recomputed_hash_after_a_payload_edit_still_fails_the_link():
    """A smarter attacker updates payload_sha256 and entry_hash too. The next
    entry's prev_hash then no longer matches, so the break just moves down one."""
    chain = build_chain()
    victim = chain[2]
    victim.payload = {"tampered": True}
    victim.payload_sha256 = payload_hash(victim.payload)
    victim.entry_hash = entry_hash_of(victim)

    result = verify_chain(chain)
    assert not result["ok"]
    assert result["first_break"]["seq"] == 4
    assert result["first_break"]["reason"] == "broken_link"


def test_rewriting_the_whole_tail_is_caught_by_the_head_hash():
    """Rewriting every entry after the edit does produce an internally valid
    chain -- that is inherent to a hash chain. It is caught because the head
    hash changes, which is what the daily Merkle root pins down."""
    clean_head = verify_chain(build_chain())["head_hash"]

    chain = build_chain()
    chain[2].payload = {"tampered": True}
    prev = chain[1].entry_hash
    for e in chain[2:]:
        e.payload_sha256 = payload_hash(e.payload)
        e.prev_hash = prev
        e.entry_hash = entry_hash_of(e)
        prev = e.entry_hash

    result = verify_chain(chain)
    assert result["ok"], "an internally consistent rewrite verifies, as expected"
    assert result["head_hash"] != clean_head, "but the head hash moves, which the root catches"


def test_deleted_entry_is_caught():
    chain = build_chain()
    del chain[2]
    result = verify_chain(chain)
    assert not result["ok"]
    assert result["first_break"]["reason"] == "sequence_gap"


def test_reordered_entries_are_caught():
    chain = build_chain()
    chain[1], chain[2] = chain[2], chain[1]
    result = verify_chain(chain)
    assert not result["ok"]


def test_edited_entry_hash_alone_is_caught():
    chain = build_chain()
    chain[1].entry_hash = "f" * 64
    result = verify_chain(chain)
    assert not result["ok"]
    assert result["first_break"]["reason"] in {"hash_mismatch", "broken_link"}


def test_break_report_names_the_entry():
    """An auditor needs to know WHICH row, not just that something is wrong."""
    chain = build_chain()
    chain[3].payload = {"nope": 1}
    brk = verify_chain(chain)["first_break"]
    assert brk["seq"] == 4
    assert brk["id"] == "entry-4"
    assert brk["subject_id"] == "s4"
    assert len(brk["detail"]) > 20


def test_only_the_first_break_is_reported():
    chain = build_chain()
    chain[1].payload = {"a": 1}
    chain[3].payload = {"b": 2}
    assert verify_chain(chain)["first_break"]["seq"] == 2


# --- Merkle -----------------------------------------------------------------

def test_merkle_root_is_stable():
    leaves = [f"{i:064x}" for i in range(7)]
    assert merkle_root(leaves) == merkle_root(list(leaves))


def test_merkle_root_changes_when_a_leaf_changes():
    leaves = [f"{i:064x}" for i in range(7)]
    other = list(leaves)
    other[3] = "f" * 64
    assert merkle_root(leaves) != merkle_root(other)


def test_merkle_root_of_a_single_leaf_is_that_leaf():
    assert merkle_root(["ab" * 32]) == "ab" * 32


def test_empty_merkle_root_is_genesis():
    assert merkle_root([]) == GENESIS_HASH


@pytest.mark.parametrize("n", [1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 33])
def test_inclusion_proof_verifies_for_every_index(n):
    leaves = [f"{i:064x}" for i in range(n)]
    root = merkle_root(leaves)
    for i in range(n):
        proof = merkle_proof(leaves, i)
        assert verify_merkle_proof(leaves[i], proof, root), f"n={n} i={i}"


@pytest.mark.parametrize("n", [3, 5, 7, 9])
def test_odd_trees_promote_rather_than_duplicate(n):
    """Duplicating the odd node (the Bitcoin approach) lets two different leaf
    sets share a root -- CVE-2012-2459 -- which would allow a forged inclusion
    proof. Promotion has no such ambiguity, so appending a duplicate of the last
    leaf must change the root."""
    leaves = [f"{i:064x}" for i in range(n)]
    assert merkle_root(leaves) != merkle_root(leaves + [leaves[-1]])


def test_proof_fails_for_a_leaf_that_is_not_in_the_tree():
    leaves = [f"{i:064x}" for i in range(6)]
    root = merkle_root(leaves)
    proof = merkle_proof(leaves, 2)
    assert not verify_merkle_proof("f" * 64, proof, root)


def test_proof_fails_against_the_wrong_root():
    leaves = [f"{i:064x}" for i in range(6)]
    proof = merkle_proof(leaves, 2)
    assert not verify_merkle_proof(leaves[2], proof, "a" * 64)


def test_merkle_proof_index_out_of_range():
    with pytest.raises(IndexError):
        merkle_proof([f"{i:064x}" for i in range(3)], 5)


# --- day bucketing ----------------------------------------------------------

def test_utc_day_ignores_the_server_timezone():
    """Entries are stored in UTC, so the day they are bucketed into must be the
    UTC day. Using date.today() means a server east of Greenwich looks for the
    wrong day for hours every night and builds an empty root while entries are
    still being written."""
    from datetime import timedelta

    late = datetime(2026, 9, 3, 23, 30, tzinfo=timezone.utc)
    assert utc_day(late) == "2026-09-03"

    # The same instant, expressed in India time, is already the 4th locally.
    india = late.astimezone(timezone(timedelta(hours=5, minutes=30)))
    assert india.date().isoformat() == "2026-09-04"
    assert utc_day(india) == "2026-09-03"


def test_utc_day_of_a_naive_timestamp_is_treated_as_utc():
    assert utc_day(datetime(2026, 9, 3, 23, 30, tzinfo=timezone.utc)) == "2026-09-03"
