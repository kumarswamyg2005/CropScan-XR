# CropScan XR — Product Requirements

Status: **Phase 0 deliverable.** This document is the scope contract. Every STOP
gate refers back to it. If a decision changes, it changes here first.

---

## 1. What this is

**CropScan XR** — one product, three surfaces, one API.

> A leaf photo becomes a verifiable field record, and the disease that photo shows
> can be stepped through in VR — infection to sporulation — with the weather dials
> that caused it exposed as controls.

The through-line, and the only thing that makes this not another CNN demo:

**diagnosis → causation → intervention → proof.**

- The model says **what**.
- The XR module says **how it got there and how to break the cycle**.
- The ledger says **this diagnosis happened, at this time, on this image, and this
  is what was paid for it**.

Cut any one of the three and the remaining two are commodity work. The connection
is the product.

## 2. Surfaces

| Surface | What it is | Primary user |
| --- | --- | --- |
| **Scan** (2D web) | Upload/capture a leaf → diagnosis, confidence, Grad-CAM, treatment plan | Farmer on a phone |
| **Field** (WebXR) | Walk a virtual crop row, replay the infection cycle of the diagnosed disease on a 3D plant, watch 360° field footage, practise the treatment | Agri student, extension worker, agronomist |
| **Ledger** (transactions) | Every scan is a signed, hash-chained record. Paid actions settle against it | Farmer, buyer, auditor |

## 3. Non-goals

Explicitly **not** built. Each requires an argument at a STOP gate to enter scope.

- No Hyperledger, Ethereum mainnet, smart contracts, wallet connect, or token.
  The ledger is a hash-chained Postgres table. Polygon Amoy **testnet** anchoring
  is a Phase 10 stretch, flag-gated, default off.
- No multiplayer, shared VR sessions, avatars, or voice.
- No Unity, Unreal, native app, or APK. WebXR in the browser only.
- No IoT, drone ingest, satellite imagery, or weather API in v1. Environment
  values in the simulator are user-controlled sliders, not live data.
- No LLM chatbot, no RAG, no agent.
- No user-generated video upload. Videos are curated and seeded.
- No mobile AR in v1. `immersive-ar` comes only after `immersive-vr` works.
- No Redis, Celery, queue, or microservices. One FastAPI service, one Postgres.
- No i18n framework. Extend the existing EN/TE `LanguageContext` + JSON.

## 4. Settled constraints

These are research findings the build must respect. They are not open for
re-litigation during implementation.

### 4.1 The 99.3% number is a lab number

PlantVillage is 54,306 images on uniform backgrounds in controlled conditions.
Models trained on it collapse in the field — 99.35% → 31.4% (Ferentinos 2018);
99.72% → 41.81% (Gui et al. 2021) — and frequently key on **background**, not
lesions. It is also ~43.4% tomato.

**Therefore:** the new model trains on a lab+field mixture, and the headline
metric in the README is **held-out field accuracy**, reported next to lab
accuracy with the gap stated. Publishing the gap is a portfolio asset.

### 4.2 The differentiator is the wiring, not the 3D

VR plant-pathology training is real and validated (TNAU downy-mildew module,
150 students, Plant Science Today 2025) but thin. Nobody in the cited work
connects a **live diagnosis** to a **life-cycle simulation** to a **transaction
record**. That connection is the contribution.

### 4.3 The disease cycle is the content spec

Nine canonical stages: survival → inoculum production → deposition →
pre-penetration → penetration → infection/incubation → colonization →
reproduction/sporulation → dispersal, looping to stage 3 (polycyclic) or
stage 1 (monocyclic).

The **disease triangle** — susceptible host × virulent pathogen × favourable
environment (+ time) — is the interaction rule. Remove a leg, the cycle stalls.
The XR simulator is literally the triangle as three dials driving a stage
machine. When leaf wetness drops below the pathogen's threshold, stage 4 must
**visibly fail**. That failure is the pedagogy.

### 4.4 The current design is a known AI tell

Warm cream near `#F4F1EA` + Playfair Display + warm-clay accent is the single
most recognisable AI-generated-design signature. Also on the tell list:
tracked-out ALL-CAPS eyebrows, `A · B · C` middot meta strings, identical
rounded cards sharing one `rgba(0,0,0,.1)` shadow, `→` glued to button text,
fade-and-slide-up on every section.

**Therefore:** a written design plan, reviewed against these tells, ships
before any component is written (Gate 3).

### 4.5 WebXR platform facts

- `@react-three/xr` v6 — `createXRStore()` + `<XR store={}>`.
- Target **WebGL2 + multiview**. WebGPU is an opt-in flag, not the demo's bet.
- 72 FPS = 13.7 ms/frame. Quest is **CPU/draw-call bound, not triangle bound**.
  Merge meshes, use `InstancedMesh`, enable multiview.
- Video uses **WebXR Media Layers** (`XRMediaBinding` → `createQuadLayer` /
  `createEquirectLayer`), not in-scene video textures. **One video at a time.**
- Layers polyfill so the module still runs on desktop Chrome for development.

### 4.6 VR UI ergonomics — non-negotiable

Panels at 0.75–1.5 m, never under 0.5 m. Primary UI inside a ~60° forward cone.
Curve wide panels. Size type by **angular size**, not pixels. Opaque plate
behind all text. No hard head-pinning; delayed lerp follow if it must follow.
Generous hit targets with hover/press feedback.

### 4.7 What "blockchain agriculture" actually buys

An immutable, auditable event record across fragmented stakeholders —
traceability, tamper-evidence, dispute resolution. Not the token.

**Therefore:** a hash-chained append-only Postgres ledger with a daily Merkle
root delivers ~95% of the demonstrable property at ~2% of the complexity, and
the trade-off is defensible in an interview — worth more than a Fabric
deployment that isn't.

### 4.8 Payments — all four steps or it's insecure

1. Create order **server-side**. 2. Open Checkout with `order_id` + public
`key_id`. 3. **Verify signature server-side**:
`hmac_sha256(order_id + "|" + payment_id, key_secret)`. 4. Handle the
**webhook** independently, verify its signature, make it idempotent.

The classic failure is a working checkout with a broken webhook. Razorpay
**test mode only** (`rzp_test_…`).

## 5. Decisions taken at the Phase 0 grill

| # | Question | Decision |
| --- | --- | --- |
| D1 | `/grill-me`, `/to-prd`, `/to-issues` unavailable in-session | Skip the tooling ceremony. This document plus `docs/issues.md` are the Phase 0 deliverable. Gate 0 = review of this file. |
| D2 | ML datasets and GPU unavailable locally | Claude writes all of `ml/`. Owner runs training on Kaggle/Colab and returns the four Gate 1 numbers. Phases 3–4 proceed in parallel against a fixture-backed inference path, since they do not depend on real weights. |
| D3 | Phase 1 restructure moves `frontend/`, Phase 6 rewrites it | Restructure `services/api`, `ml`, `data`, `docs`, `infra` in Phase 1. **Leave `frontend/` in place** until the Phase 6 TypeScript migration moves it into `apps/web` as one operation. One touch, not two. |
| D4 | `model.pt` 15.7 MB in git history | Old `origin` remote **removed** — this repo is disconnected and will publish to a new GitHub project. The blob remains in history; a clean-history re-init is available as an opt-in at Gate 1. |
| D5 | Commit attribution | **No AI attribution on this repo.** No `Co-Authored-By: Claude`, no trailers, no generated signatures. Overrides the harness default. |
| D6 | §11.5 Treatment Bench | **Demoted to stretch.** It is a fourth XR scene teaching dose-setting with no dose field in the §8 schema to validate against, and it is the weakest link to the through-line. Revisit at Gate 4. |
| D7 | §10.2 colour constraint reads as self-contradictory | Chlorophyll/chlorosis/necrosis/sporulation greens, yellows and browns are permitted **as encoded data values** (severity, confidence). They are forbidden **as decoration**. Resolved in the design plan at Gate 3. |

## 6. Risks and blockers

| Risk | Impact | Owner | Mitigation |
| --- | --- | --- | --- |
| Field accuracy lands under ~70% | Gate 1 fails; whole story weakens | Owner | Change the dataset mixture, not the story. Never re-report a lab number as the headline. |
| PlantDoc label noise (documented) | Corrupts field eval | Claude | Spot-check labels during manifest build; log suspect rows to the dataset card. |
| 72 FPS on Quest 3 with full spore VFX | Gate 4 fails | Owner (hardware) | Instancing + merged geometry + multiview from the first commit, not as later optimisation. Budget is acceptance criteria, not aspiration. |
| Razorpay webhook races (webhook before verify) | Paid-but-unfulfilled orders | Claude | Unique constraint on `rzp_event_id` is the idempotency mechanism. All six race cases are tests, not manual checks. |
| Scope is 6–9 months of solo work | Nothing ships | Both | Demo-critical spine is **Phase 1 → 3 → 4 → 6 → 7**. Phases 5, 8, 10 and the video pipeline are additive and are the cut order if time runs out. |
| No headset available to Claude | Gate 4 unverifiable in-session | Owner | Owner records the Quest capture. `docs/xr_test_plan.md` is the manual checklist. |

## 7. Architecture

**Frontend** — React 19 + TypeScript + Vite, Tailwind v4 CSS-first `@theme`,
React Router v7, `three` + `@react-three/fiber` + `drei` + `@react-three/xr`,
`@react-three/uikit` for in-VR panels, `hls.js`, TanStack Query,
Motion with `LazyMotion` + `m`.

**Backend** — one FastAPI service. Python 3.12, Pydantic v2, SQLAlchemy 2.0 +
Alembic, pytest, PostgreSQL. **`onnxruntime`, not torch** — the API image must
not ship PyTorch. `razorpay`, `python-multipart`, `pillow`. S3-compatible
object storage with signed URLs.

**ML** — separate `ml/` package, **never imported by the API**. PyTorch + timm,
Albumentations, ONNX export + `onnxsim`, Grad-CAM at export time. The API
consumes only `model.onnx` + `labels.json` + `meta.json`.

```
apps/web/           React app (2D routes + lazy /field XR route)
services/api/       FastAPI + Alembic + tests
ml/                 training, eval, export (own requirements.txt)
data/               dataset manifests + disease_cycle.json + disease_info.json (NOT images)
docs/               ADRs, model card, eval report, demo script
infra/              docker-compose (postgres + minio), Dockerfiles
```

### 7.1 Export contract

`ml/export.py` produces exactly three files into `services/api/model/`:

```
model.onnx     opset 17, fp32, dynamic batch, simplified
labels.json    ordered canonical class ids
meta.json      {input_size, normalization, model_name, trained_at, git_sha,
                metrics:{lab_acc, field_acc, macro_f1_field, ece},
                confidence_threshold, gradcam_layer}
```

**Nothing about the model is hardcoded on the server.** The API reads
`meta.json` for threshold and normalization.

### 7.2 Ledger

Append-only. No update or delete path exists in code, and the DB user holds no
`UPDATE`/`DELETE` grant on `ledger_entry`.

```
entry_hash = sha256(seq || created_at_iso || event_type || subject_id
                    || payload_sha256 || prev_hash)
```

`prev_hash` of entry *n* is `entry_hash` of *n−1*; genesis is 64 zeros. Events:
`scan.created`, `scan.uncertain`, `order.created`, `order.paid`,
`order.refunded`, `consult.booked`, `module.unlocked`. A daily Merkle root is
stored. `/api/ledger/verify` walks the chain and reports the first broken link.

### 7.3 Abstain / OOD — required, not optional

The XR module tells a causal story about a specific pathogen. Telling that story
about a wrong or non-plant input is the worst outcome in this system.
Max-softmax + entropy thresholding, tuned on a rejection set. Below threshold
the API returns `status: "uncertain"` with **no `disease_id`**, the UI asks for
a retake with guidance, and **the XR module refuses to launch**.

## 8. Build order and gates

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 0 | This PRD + `docs/issues.md` | **Gate 0**: PRD reviewed |
| 1 | Deletion commit; restructure to pnpm workspace (excl. `frontend/`, per D3) | Tree shown, no code yet |
| 2 | ML: manifest → train → eval → export | **Gate 1**: four numbers + background probe |
| 3 | `disease_cycle.json` for apple/tomato/potato, schema-validated | **Gate 2**: biology reviewed with owner |
| 4 | API: scans + diseases + cycle + ledger. No payments | Ledger tamper demo working |
| 5 | API: payments + webhooks + video registry | All six payment tests green |
| 6 | Web: design plan doc, then 2D rebuild + TS migration | **Gate 3**: design plan before components |
| 7 | XR: Row + Infection Theatre | **Gate 4**: 72 FPS capture from Quest |
| 8 | XR: Field Theatre (+ Treatment Bench if D6 revisited) | Manual XR checklist passed |
| 9 | Docs: README, model card, eval report, ADRs, demo script | — |
| 10 | *Optional* Polygon Amoy anchoring, flag-gated | Only if 1–9 are solid |

**Do not start a phase before its predecessor's gate is cleared.**

## 9. Metrics we publish

Every number on the site must be defensible in an interview.

- **Headline: held-out field accuracy** (`test_field`, field images only, never
  used for model selection).
- Lab accuracy next to it, and the **domain gap** as an explicit number.
- Macro-F1 on both splits; per-class F1 with the worst 10 called out.
- **ECE + reliability diagram.** A confident wrong answer is the dangerous
  failure mode for a farmer.
- **Background-bias probe**: score a held-out set with the leaf masked out. If
  the model still beats chance, say so. This is the most interesting plot in the
  project.
- Abstain-rate curve for the OOD threshold.

## 10. Definition of done

A visitor can:

1. Photograph a diseased leaf and get a **calibrated** diagnosis that admits when
   it doesn't know.
2. Read **why that plant got sick** in plain language.
3. Put on a headset and watch the pathogen's cycle run — then **break it by
   changing one environmental condition**.
4. Buy the treatment in Razorpay test mode.
5. **Independently verify** that the whole sequence is recorded in a chain that
   visibly detects tampering.

`/about` states the field-accuracy gap plainly. That page is not filler; it is
the most credible thing on the site.
