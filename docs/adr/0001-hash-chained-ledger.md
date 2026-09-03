# ADR 0001 — A hash-chained Postgres table instead of Fabric or Ethereum

**Status:** accepted · **Date:** 2026-09-03

## Context

Every scan and every payment has to produce a record that a third party can
check has not been altered. "Blockchain for agriculture" is the obvious framing,
and the literature is consistent about what actually delivers value there: an
immutable, auditable event record across a fragmented stakeholder set —
traceability, tamper-evidence, dispute resolution. Not the token.

Permissioned Fabric is the enterprise answer precisely because public chains
bring cost, latency and privacy problems.

## Decision

An append-only Postgres table with a SHA-256 hash chain and a daily Merkle root.

```
entry_hash = sha256(seq || created_at_iso || event_type || subject_id
                    || payload_sha256 || prev_hash)
```

Append-only is enforced twice, on purpose:

- there is no UPDATE or DELETE path for `ledger_entry` anywhere in the codebase
- the first migration revokes UPDATE, DELETE and TRUNCATE on that table from the
  application role

The first is what a reviewer checks. The second is what holds when the code is
wrong.

## Consequences

**What this buys.** Tamper-evidence you can demonstrate live in five seconds
(`docs/demo.md`), inclusion proofs for any single entry, and roughly 200 lines
of code with no new infrastructure.

**What it does not buy.** It proves nobody altered the record. It does not prove
the operator did not fabricate it at write time — a single operator controls both
the chain and the clock. Fabric's multi-party endorsement is what addresses that,
and it matters when the parties do not trust each other's databases. For a
single-operator service it is machinery without a corresponding threat.

**The gap is closable and named.** Anchoring the daily Merkle root to a public
testnet makes the operator unable to backdate, because the root is then witnessed
by someone else. That is Phase 10, flag-gated behind `LEDGER_ANCHOR_ENABLED`,
default off — a real upgrade path rather than a pretence that the gap is not there.

## Alternatives

- **Hyperledger Fabric.** Correct for multi-party trust; a network to operate,
  chaincode to maintain, and a demo that cannot run on a laptop. Rejected as
  complexity with no matching threat here.
- **Ethereum mainnet / smart contracts.** Per-write cost and latency for a
  system that writes on every scan, plus putting agronomic data on a public
  chain. Rejected.
- **Append-only table with no hashing.** Simpler, and proves nothing — a row
  can be edited and nothing detects it.

## Merkle detail worth recording

An odd node is **promoted**, not duplicated. Duplicating the last leaf (the
Bitcoin approach) lets two different leaf sets produce the same root
(CVE-2012-2459), which would permit a forged inclusion proof. Certificate
Transparency promotes instead, and so do we. `test_odd_trees_promote_rather_than_duplicate`
covers it.
