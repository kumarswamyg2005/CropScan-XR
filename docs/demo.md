# Demo script — 3 minutes

The order matters. Each step sets up the next, and the last one is the payoff.

## Before you start

```bash
docker compose -f infra/docker-compose.yml up -d
cd services/api && alembic upgrade head && python seed.py && cd -
uvicorn app.main:app --app-dir services/api --port 8000 &
pnpm --filter web dev
```

Check `http://localhost:8000/healthz` reports `model_loaded: true`. If it does
not, run `ml/export.py` first — the demo has no inference without it.

---

## 1. Scan a leaf (30s)

Open `/scan`. Photograph or upload a diseased apple, tomato or potato leaf.

Point out the guidance panel while it uploads: fill the frame, diffuse light,
one leaf, plain backing. That is not decoration — it is what decides whether
the model answers at all.

## 2. Read the determination (30s)

The result page is a herbarium mounting sheet. Two things to point at:

- **The specimen.** Toggle Photo / Model attention. The Grad-CAM shows where
  the model actually looked. If it is looking at the background rather than the
  lesion, say so — that is what the background-bias probe on `/about` measures.
- **The determination label.** Identification, confidence, model version, and
  the ledger sequence. It is the receipt and the diagnosis in one object.

## 3. Show it admitting when it does not know (20s)

Scan something that is not a leaf — a hand, the desk, a coffee cup.

The page comes back **uncertain**, in grey, with no disease named and no
Grad-CAM. "Enter the field" is disabled with a reason under it.

> This is the part most demos skip. The model abstaining is a feature: the XR
> module tells a causal story about a specific pathogen, and telling that story
> about the wrong pathogen is the worst thing this system could do.

## 4. Enter the field and break the cycle (60s)

Go back to the good scan and press **Enter the field**.

1. **The Row** — a crop row; the diagnosed plant is the marked one in front of you.
2. Switch to **Infection Theatre**. The disease triangle glyph is lit on all
   three legs and the cycle runs end to end.
3. Now drag **leaf wetness** down to 3 hours.

The cycle halts at Germination. An × appears on that stage in the timeline, the
spores stop, the environment leg of the triangle goes dark, and the panel says:

> *leaf wetness is 3 h, below the 9 h this stage needs*

That number is not invented for the demo. It is `requires.leaf_wetness_hr` on
the `prepenetration` stage in `data/disease_cycle.json`, sourced to the Mills
table. **Remove one leg of the disease triangle and the cycle stalls** — that is
the whole pedagogy, and it is one slider.

Try **Tomato leaf mould** for the cleanest version: drop humidity below 85% and
the disease simply cannot start. That is why leaf mould is a greenhouse problem
and rare in open fields.

## 5. Buy the treatment kit (20s)

From the result page, order the treatment kit. Razorpay opens in **test mode**.

Use test card `4111 1111 1111 1111`, any future expiry, any CVV.

The receipt page shows the order paid. Two things happened server-side that are
worth naming: the amount came from the `product` table, not from the browser,
and the order was marked paid in the same transaction that wrote the ledger
entry.

## 6. Tamper with the database — the payoff (40s)

Open `/ledger`. Press **Verify the chain**. It reports **Chain intact** and the
number of entries checked.

Now edit history directly, as the superuser, bypassing the application entirely:

```bash
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U cropscan -d cropscan
```

```sql
-- Look at what is there
SELECT seq, event_type, payload->>'disease_id' AS disease
FROM ledger_entry ORDER BY seq;

-- Change one diagnosis after the fact.
-- This is exactly what a dispute would look like: someone claiming the
-- record always said the plant was healthy.
UPDATE ledger_entry
SET payload = jsonb_set(payload, '{disease_id}', '"Tomato___healthy"')
WHERE seq = 1;
```

Go back to `/ledger` and press **Verify the chain** again.

```
Chain broken
seq       1
reason    payload_modified
detail    The stored payload no longer hashes to payload_sha256.
          This row's contents were edited after it was written.
```

### The follow-up question, and the answer

*"So just recompute the hash too."*

Try it:

```sql
UPDATE ledger_entry
SET payload_sha256 = encode(sha256(payload::text::bytea), 'hex')
WHERE seq = 1;
```

Verify again. The break has **moved to seq 2**, `reason: broken_link` — entry 2
still carries the old entry 1 hash in its `prev_hash`. To hide the edit you have
to rewrite every entry after it, and the head hash still changes, which is what
the daily Merkle root pins down.

Restore with `docker compose down -v` and re-seed.

> Note the application role cannot do any of this: the first migration revokes
> UPDATE and DELETE on `ledger_entry`. The demo uses the superuser deliberately,
> because the point is that even a superuser edit is **detected**.

---

## What to say if asked "why not a real blockchain?"

The property being demonstrated is tamper-evidence on an append-only event log.
A hash chain in Postgres with a daily Merkle root gives that, verifiably, in
about 200 lines. A permissioned Fabric network gives the same property plus
multi-party consensus — which matters when the parties do not trust each other's
databases, and does not matter for a single-operator service.

The honest trade-off: this design proves *nobody altered the record*. It does
not prove *the operator did not fabricate it in the first place*. Anchoring the
daily root to a public testnet closes that gap, which is why it is Phase 10 and
flag-gated rather than pretended-away. See `docs/adr/0001-hash-chained-ledger.md`.
