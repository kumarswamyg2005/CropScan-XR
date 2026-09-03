# CropScan XR — Build Prompt

> Paste everything below the line into Claude Code, from a clean checkout of
> `github.com/kumarswamyg2005/Crop-Disease-Detector`.
> Section 0 must run before any code is written.

---

## 0. SETUP — do this BEFORE writing any code

Install and activate tooling first:

```
# anti-over-engineering (mandatory, standing rule on all my projects)
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
/ponytail full

# plan → TDD pipeline
npx skills@latest add mattpocock/skills
```

Then run `/grill-me` on this document before touching a file. Do not skip it.
Push back on anything in here you think is wrong or over-scoped — I want the
argument, not compliance. After `/grill-me`, produce `/to-prd`, then `/to-issues`,
then build issue-by-issue with `/tdd` where tests are cheap.

**Standing rules for this repo:**

- Never appear as a git contributor. No `Co-Authored-By: Claude`, no AI trailers,
  no AI attribution in commit messages, no generated signatures. Commits are mine.
- No duplicated logic under different function names. One function, one job.
- No speculative abstraction. If it has one caller, it is not a framework.
- Every phase ends at a **STOP gate** (Section 14). Do not roll past a gate.

---

## 1. WHAT EXISTS TODAY (audited — do not re-discover this)

```
backend/     FastAPI. main.py (4 routes), model.py (EfficientNet-B0 loader with
             4 fallback load paths), model.pt (16 MB, committed), class_names.json,
             disease_info.json (38 classes: name/plant/severity/symptoms/organic/
             chemical/prevention), translations_te.json, Dockerfile
frontend/    React 18 + Vite 5 + Tailwind 3, JS not TS. 4 pages (Home 360 LOC,
             Detect 291, Result 311, About 267), Navbar, LanguageContext (EN/TE).
             ~1,400 LOC total. Inline `style={{}}` mixed with Tailwind classes.
ml/          train.ipynb (Kaggle, PlantVillage, 2-phase fine-tune)
```

Current model: EfficientNet-B0, PlantVillage, 38 classes, 99.3% **in-domain** test
accuracy. Live on Vercel + a Render/HF backend.

**Everything in `ml/` and the model half of `backend/` is being deleted.** See Section 6.

---

## 2. WHAT WE ARE BUILDING

**CropScan XR** — one product, three surfaces, one API.

| Surface                   | What it is                                                                                                                                                       | Who it's for                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Scan** (2D web)         | Upload/capture a leaf → diagnosis, confidence, Grad-CAM, treatment plan                                                                                          | farmer on a phone                          |
| **Field** (WebXR)         | Immersive module: walk a virtual crop row, replay the _infection cycle_ of the diagnosed disease on a 3D plant, watch 360° field footage, practise the treatment | agri student, extension worker, agronomist |
| **Ledger** (transactions) | Every scan is a signed, hash-chained record. Paid actions — treatment kits, expert VR consults, premium modules — settle against it                              | farmer, buyer, auditor                     |

The through-line, and the thing that makes this not-another-CNN-demo:
**diagnosis → causation → intervention → proof.**
The model says _what_. The XR module says _how it got there and how to break the cycle_.
The ledger says _this diagnosis happened, at this time, on this image, and this is
what was paid for it_.

### 2.1 The one-sentence pitch to keep you honest

> A leaf photo becomes a verifiable field record, and the disease that photo shows
> can be stepped through in VR — infection to sporulation — with the weather dials
> that caused it exposed as controls.

---

## 3. HARD SCOPE BOUNDARIES

Build **none** of the following. If you think one is needed, argue it at a STOP gate:

- No Hyperledger, no Ethereum mainnet, no smart contracts, no wallet connect, no
  token. The ledger is a hash-chained Postgres table (Section 9.4). Optional
  Polygon Amoy **testnet** anchoring is a Phase 5 stretch, disabled by default.
- No multiplayer / shared VR sessions / avatars / voice.
- No Unity, no Unreal, no native app, no APK. WebXR in the browser only.
- No IoT, no drone ingest, no satellite imagery, no weather API in v1
  (environment values in the simulator are user-controlled sliders, not live data).
- No LLM chatbot. No RAG. No agent.
- No user-generated video upload. Videos are curated and seeded by us.
- No mobile AR mode in v1 (`immersive-ar` comes after `immersive-vr` works).
- No Redis, no Celery, no queue, no microservices. One FastAPI service, one Postgres.
- No i18n framework. Keep the existing EN/TE two-language context; extend the JSON,
  do not install i18next.

---

## 4. RESEARCH FINDINGS YOU MUST BUILD AGAINST

These are settled. Do not re-litigate them; do not ignore them.

### 4.1 The 99.3% number is a lab number, and the README currently oversells it

PlantVillage is 54,306 images shot on uniform backgrounds in controlled conditions.
Models trained on it routinely collapse in the field: 99.35% → 31.4% on field images
(Ferentinos 2018); 99.72% → 41.81% on field-PV (Gui et al. 2021). Analysis shows
PlantVillage-trained models frequently key on **background**, not lesions. It is also
badly imbalanced — tomato alone is ~43.4% of the images.

→ _Therefore:_ the new model trains on a lab+field mixture and the headline metric in
the README is **held-out field accuracy**, reported next to lab accuracy. We publish
the gap instead of hiding it. That honesty is a portfolio asset, not a weakness.

- PlantVillage: 54,306 img / 38 classes / lab — https://arxiv.org/pdf/1911.10317
- PlantDoc: 2,598 img / 27 classes / field — https://arxiv.org/pdf/1911.10317
- PlantWild: 18,542 img / 89 classes (56 diseased) / in-the-wild — see benchmark table
  in https://arxiv.org/pdf/2605.09768
- Prior art for the exact mixture we want: https://arxiv.org/pdf/2508.10817
  (unified PlantVillage + PlantDoc + PlantWild, 101 classes / 33 crops, ~37% lab / 63% field)
- Background-bias + field-collapse review: https://pmc.ncbi.nlm.nih.gov/articles/PMC13066816/

### 4.2 The VR-for-plant-pathology idea is real and validated — copy the good part

Tamil Nadu Agricultural University built and evaluated a VR module on **downy mildew
of grapes** teaching "identification, **life cycle** and symptoms", tested on 150
agriculture students (Plant Science Today, 2025 — https://doi.org/10.14719/pst.10460).
Broader reviews confirm VR crop-disease training is an active, thin field:

- Occupational-safety VR in agriculture scientometric review (2025) — field is young
- DEMETRA: laser-scanned + photogrammetry hazelnut tree for pruning training —
  https://doi.org/10.3390/designs9020032
- HoloFarm immersive agricultural learning — https://doi.org/10.1016/j.simpa.2025.100768
- AR for on-field plant disease analysis (IRJMETS 2024)

→ _Therefore:_ the differentiator is not "3D plant in VR". It is **the life-cycle
simulation wired to a live diagnosis and to a transaction record**. Nobody in the
cited work connects the three.

### 4.3 The disease-cycle model to implement (this is the "how did the plant get it" spec)

Canonical stages, from plant pathology (Agrios; CABI; disease-triangle literature):

```
1 SURVIVAL / OVERSEASONING   spores, sclerotia, mycelium, seed, residue, alternate host
2 INOCULUM PRODUCTION        primary inoculum forms
3 DEPOSITION / INOCULATION   inoculum lands on host
4 PRE-PENETRATION            germination; appressorium forms; needs leaf wetness
5 PENETRATION                stomata / wounds / direct cuticle breach
6 INFECTION + INCUBATION     defences suppressed; latent period; no visible symptom yet
7 COLONIZATION               spread through tissue; visible lesion
8 REPRODUCTION / SPORULATION new infectious units
9 DISPERSAL                  wind, rain-splash, insect vector, tools, human movement
                             → back to 3 (polycyclic) or to 1 (monocyclic)
```

The **disease triangle** — susceptible host × virulent pathogen × favourable
environment (+ time) — is the interaction rule. Remove any leg and the cycle stalls.

→ _Therefore:_ the XR simulator is literally the disease triangle as three input
dials driving a stage machine. When the user sets leaf-wetness below the pathogen's
threshold, stage 4 must visibly fail and the cycle must halt. That is the pedagogy.
Intervention points (fungicide timing, sanitation, resistant variety, spacing) are
overlays on specific stages.

Sources: https://openbooks.col.org/integrateddiseasemanagement/chapter_3-components-of-plant-disease-development.html
· https://www.cabidigitallibrary.org/doi/pdf/10.5555/20203465542
· https://researcherslinks.com/current-issues/Plant-Disease-Epidemiology-Disease/6/9/1390/html

### 4.4 Frontend: the current design is a known AI tell — change it

The existing palette is `#F6F2EB` warm cream + Playfair Display serif + warm accents.
That exact cluster — warm cream near `#F4F1EA`, high-contrast serif display, warm-clay
accent — is the single most recognisable AI-generated-design signature right now.
Also on the tell list, all of which the current site or its likely rewrite uses:
tracked-out ALL-CAPS eyebrow labels, `A · B · C` middot meta strings, identical
rounded cards with one shared `rgba(0,0,0,.1)` shadow, `→` glued to button text,
fade-and-slide-up on every section.

→ _Therefore:_ Section 10 mandates a **new visual direction derived from the subject
matter** (plant pathology documentation), and a written design-plan pass that is
reviewed against these tells before any component is written.

### 4.5 WebXR platform facts (2026)

- `@react-three/xr` v6 is the current package (`createXRStore()` + `<XR store={}>`).
  Install `three @react-three/fiber @react-three/xr@latest`. Docs: https://pmndrs.github.io/xr/docs/
- WebGPU now ships across major browsers and three.js has a WebGPU path; Quest Browser
  exposes WebXR through it. **Still target WebGL2 + multiview for v1** and treat WebGPU
  as an opt-in flag — do not bet the demo on it.
- Frame budget is hard: 72 FPS = 13.7 ms, 90 FPS = 11.1 ms _per frame_. Quest is
  usually **CPU/draw-call bound, not triangle bound** — a thousand single-triangle
  draw calls will miss 72 FPS. Merge meshes, use `InstancedMesh`, enable multiview,
  minimise state changes. https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/
- Video in VR: use **WebXR Media Layers** (`XRMediaBinding` → `createQuadLayer` /
  `createEquirectLayer`). The compositor samples the video once, preserving quality and
  saving GPU. Regular in-scene video textures are lower quality and higher overhead.
  https://developers.meta.com/horizon/documentation/web/webxr-layers/
  · three.js reference: https://threejs.org/examples/webxr_vr_layers.html
  · Quest decodes 4K on all formats, 8K on h.265/AV1; **play one video at a time**.
  https://developers.meta.com/horizon/documentation/web/browser-video/
- Layers polyfill exists for browsers without native support — use it so the module
  still runs on desktop Chrome for development.

### 4.6 VR UI ergonomics (non-negotiable for the XR module)

- Panels at **0.75–1.5 m**; never closer than 0.5 m (vergence–accommodation conflict);
  system-panel limits are 0.75 m min / 5 m max.
- Keep primary UI inside a **~60° forward cone**; no neck-craning.
- **Curve** wide panels so edges stay equidistant. Flat full-view HUDs break immersion.
- Size type by **angular size**, not pixels. Bold, high-contrast, short blocks. Always
  put an opaque or gradient plate behind text so it stays legible against the scene.
- Do not hard-pin UI to the head; if it must follow, use delayed lerp follow.
- Space hit targets generously; give hover/press feedback; avoid hand occlusion.

Refs: https://developer.android.com/design/ui/xr/guides/spatial-ui
· https://github.com/Esin-M/FlUId-VR_UI_Guidelines/wiki/General-VR-Design-&-UI,-UX-Principles

### 4.7 Transactions: what "blockchain agriculture" actually buys you

The literature is clear that the value is an **immutable, auditable event record**
across a fragmented stakeholder set — traceability, tamper-evidence, dispute
resolution — not the token. Permissioned Fabric is the enterprise answer precisely
because public chains bring cost, latency and privacy problems.

→ _Therefore:_ for a portfolio build, a **hash-chained append-only Postgres ledger
with a daily Merkle root** delivers 95% of the demonstrable property (tamper-evidence
you can prove live) at 2% of the complexity, and you can explain the trade-off in an
interview — which is worth more than a Fabric deployment you can't defend. Anchoring
the daily root to a public testnet is the optional last 5%.

Refs: https://arxiv.org/pdf/2003.06862 · https://arxiv.org/pdf/2401.09476
· https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1762861/full

### 4.8 Payments

Razorpay, **test mode only** (`rzp_test_…`, no KYC needed). The four steps that must
all exist or it's insecure:

1. Create order **server-side** (never client-side)
2. Open Razorpay Checkout with `order_id` + public `key_id`
3. **Verify signature server-side**: `hmac_sha256(order_id + "|" + payment_id, key_secret)`
4. Handle the **webhook** independently, verify its signature, and make it idempotent

The classic failure is a working checkout with a broken webhook: paid-but-unfulfilled
orders, double charges, refunds that never reverse.
Docs: https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/

---

## 5. TARGET STACK

Pin these. Do not add anything not on this list without arguing for it at a gate.

**Frontend** (single app, code-split)

- React 19 + TypeScript + Vite (migrate the existing JS; TS is not optional)
- Tailwind CSS v4, CSS-first `@theme` config — one token source, no `tailwind.config.js`
  colour duplication, no inline `style={{}}` except for genuinely computed values
- React Router v7
- `three` + `@react-three/fiber` + `@react-three/drei` + `@react-three/xr@latest`
- `@react-three/uikit` for in-VR panels (reads the same tokens as the 2D app)
- `hls.js` for adaptive video outside XR
- TanStack Query for server state. No Redux, no Zustand unless XR state forces it.
- Motion (`motion/react`) with `LazyMotion` + `m` — and used sparingly (Section 10.4)

**Backend** — one FastAPI service

- Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 + Alembic, pytest
- PostgreSQL (plain; no extensions)
- `onnxruntime` for inference — **not** torch. The API image must not ship PyTorch.
- `razorpay` SDK, `python-multipart`, `pillow`
- Object storage for media: S3-compatible (R2/Supabase/MinIO local). Signed URLs.

**ML** — separate `ml/` package, never imported by the API

- PyTorch + timm for training, Albumentations for augmentation
- ONNX export + `onnxsim`; the API consumes only `model.onnx` + `labels.json` + `meta.json`
- Grad-CAM at export time via `pytorch-grad-cam` (or a 30-line hook implementation)
- Trained on Kaggle/Colab GPU, exactly as before

**Repo layout** (pnpm workspace)

```
apps/web/           React app (2D routes + lazy /field XR route)
services/api/       FastAPI + Alembic + tests
ml/                 training, eval, export (own requirements.txt)
data/               dataset manifests + disease_cycle.json + disease_info.json (NOT images)
docs/               ADRs, model card, eval report, demo script
infra/              docker-compose (postgres + minio), Dockerfiles
```

---

## 6. DELETION LIST — do this first, in its own commit

Delete, do not comment out:

```
backend/model.py            entire 4-path fallback loader
backend/model.pt            16 MB weights committed to git
backend/class_names.json    and the duplicate at repo root
class_names.json            root-level duplicate
ml/train.ipynb              old PlantVillage notebook
training_curves (2).png     old artefact, filename has a space and a paren
```

Also:

- Strip the torch/torchvision lines from `backend/requirements.txt`.
- `backend/main.py` keeps its shape but loses every model import; it becomes a stub
  that 503s on `/predict` until Phase 1 lands. Do not leave a random-weight fallback
  model in place — silently returning garbage predictions is worse than an error.
- **Keep** `disease_info.json` and `translations_te.json`. They are hand-written
  content and they migrate into `data/` and then into the DB.
- `model.pt` stays in git history. Note it in the PR; offer `git filter-repo` as a
  separate, opt-in cleanup. Do not rewrite history unprompted.

Commit message for this one: plain, describing the deletion. Nothing else in it.

---

## 7. PHASE 1 — ML REBUILD FROM SCRATCH

Everything here lives in `ml/`. The API does not import it.

### 7.1 Dataset

Build a unified lab+field corpus. Target the mixture that the prior art validates:
roughly one third lab, two thirds field.

| Source       | Role                | Note                                                              |
| ------------ | ------------------- | ----------------------------------------------------------------- |
| PlantVillage | lab baseline        | subsample to fight the 43% tomato skew                            |
| PlantDoc     | field               | small (2,598); annotation noise is documented — spot-check labels |
| PlantWild    | field / in-the-wild | main field volume                                                 |

Write `ml/data/build_manifest.py`. It produces `data/manifests/{train,val,test_lab,test_field}.csv`
with columns: `path, label, source, split, domain(lab|field)`. Deterministic seed.
**Rules:**

- Class taxonomy is defined once, in `data/taxonomy.yaml`, mapping every source's raw
  label to a canonical `crop___condition` id. Sources disagree on naming; resolve it
  here, not in training code.
- `test_field` is **field images only** and is never used for model selection.
- Split by image group where possible so near-duplicates don't straddle splits —
  PlantVillage has heavy intra-class redundancy.
- Cap per-class training count; log the final class distribution to `docs/dataset_card.md`.

### 7.2 Training

- Backbone: start with `convnext_tiny` or `efficientnetv2_s` from timm, ImageNet-pretrained.
  Run **one** comparison against the old EfficientNet-B0 baseline; pick on `test_field`,
  not `test_lab`. Do not build a model zoo.
- Augmentation must attack background bias directly: random resized crop, colour jitter,
  random shadow, motion blur, JPEG compression artefacts, coarse dropout, background
  replacement where segmentation is cheap.
- Two-phase fine-tune (head, then full at lower LR), cosine schedule, label smoothing,
  early stop on `val` macro-F1.
- Log to CSV + matplotlib. **No Weights & Biases**, no MLflow, no experiment tracker.

### 7.3 Evaluation — the part that matters

`ml/eval.py` emits `docs/eval_report.md` containing:

1. Accuracy + macro-F1 on `test_lab` **and** `test_field`, side by side, with the
   **domain gap** stated as a headline number.
2. Per-class F1 table; worst 10 classes called out.
3. Confusion matrix (field).
4. Calibration: reliability diagram + ECE. A confident wrong answer is the dangerous
   failure mode for a farmer.
5. **Background-bias probe**: score a held-out set with the leaf masked out. If the
   model still beats chance, say so in the report. This is the single most
   interesting plot in the whole project.
6. Abstain-rate curve for the OOD threshold below.

### 7.4 Export contract

`ml/export.py` produces exactly three files into `services/api/model/`:

```
model.onnx     opset 17, fp32, dynamic batch, simplified
labels.json    ordered canonical class ids
meta.json      {input_size, normalization, model_name, trained_at, git_sha,
                metrics:{lab_acc, field_acc, macro_f1_field, ece},
                confidence_threshold, gradcam_layer}
```

The API reads `meta.json` for the threshold and normalization. Nothing about the model
is hardcoded on the server. Add a smoke test that loads the ONNX and asserts a fixed
image produces a fixed top-1 within tolerance.

### 7.5 Abstain / out-of-distribution

Required, not optional. The XR module tells a causal story about a specific pathogen —
telling that story about a wrong or non-plant input is the worst outcome in this system.
Implement max-softmax + entropy thresholding, tuned on a rejection set (random non-leaf
photos, blurred leaves, hands, soil). Below threshold the API returns
`status: "uncertain"` with no `disease_id`, and the UI says _retake the photo_ and offers
better-photo guidance. **The XR module refuses to launch on an uncertain scan.**

**STOP GATE 1** — report the four headline numbers (lab acc, field acc, gap, ECE) and
the background-probe result before proceeding. If field accuracy is under ~70%, we
change the dataset mixture, not the story.

---

## 8. PHASE 2 — THE DISEASE-CYCLE KNOWLEDGE BASE

This is the content layer that makes the XR module mean something. Without it the VR
is decoration. Build it before the 3D.

`data/disease_cycle.json`, keyed by canonical class id, validated by a Pydantic model
and by a schema test that every non-healthy class has an entry.

```jsonc
"Apple___Apple_scab": {
  "pathogen": { "name": "Venturia inaequalis", "type": "fungus" },
  "primary_inoculum": "Ascospores from pseudothecia in overwintered fallen leaves",
  "overseasoning": "Fallen infected leaves on the orchard floor",
  "stages": [
    {
      "id": "survival",
      "label": "Overwintering",
      "label_te": "…",
      "what_happens": "One sentence, plain language, farmer-readable.",
      "duration_hint": "Autumn to bud break",
      "requires": { "temp_c": [0, 20], "leaf_wetness_hr": null, "rh_pct": null },
      "visible": false,
      "vfx": "spores_dormant_in_litter"
    }
    // … one entry per stage present for this pathogen (Section 4.3 list)
  ],
  "environment": {
    "temp_c":          { "min": 6,  "optimal": 17, "max": 26 },
    "leaf_wetness_hr": { "min": 9,  "optimal": 18 },
    "rh_pct":          { "min": 80, "optimal": 95 }
  },
  "dispersal": ["rain_splash", "wind"],
  "cycle_type": "polycyclic",
  "interventions": [
    { "stage_id": "prepenetration", "action": "Protectant fungicide before the wetting event",
      "effect": "blocks", "kind": "chemical" },
    { "stage_id": "survival", "action": "Rake and destroy fallen leaves in autumn",
      "effect": "reduces_inoculum", "kind": "cultural" }
  ],
  "sources": ["…citation…"]
}
```

**Rules:**

- Every field is sourced. Put the citation in. This is agronomic advice; a wrong
  fungicide timing is a real cost to a real person.
- Do not generate 38 of these in one pass and move on. Do **three crops properly**
  (apple, tomato, potato) with citations, ship, then extend. A shallow 38 is worthless;
  a rigorous 3 is a demo.
- `requires` thresholds drive the simulator's stage gating. `null` means unconstrained.
- Healthy classes get no cycle entry; the API returns `cycle: null` and the UI offers
  the XR module in "browse" mode instead of "diagnosis" mode.

---

## 9. PHASE 3 — BACKEND API

One FastAPI service. Alembic from the first migration.

### 9.1 Data model

```
scan            id, created_at, image_key, image_sha256, model_version,
                disease_id, confidence, top3 (jsonb), status(ok|uncertain),
                gradcam_key, client_meta (jsonb)
ledger_entry    id, seq (monotonic), created_at, event_type, subject_id,
                payload (jsonb), payload_sha256, prev_hash, entry_hash
merkle_root     id, day, root_hash, entry_count, anchored_tx (nullable)
product         id, sku, kind(kit|consult|module), title, price_paise, disease_id (nullable)
order           id, created_at, product_id, scan_id (nullable), amount_paise,
                status(created|paid|failed|refunded), rzp_order_id, rzp_payment_id
webhook_event   id, rzp_event_id (unique), received_at, processed_at, raw (jsonb)
video           id, disease_id, kind(treatment|field360|symptom_closeup),
                title, hls_url, poster_key, duration_s, projection(flat|equirect|equirect180),
                stereo(none|top_bottom|left_right), language
```

### 9.2 Endpoints

```
POST /api/scans                     multipart image → runs ONNX → returns diagnosis
GET  /api/scans/{id}
GET  /api/diseases                  list, with has_cycle / has_video flags
GET  /api/diseases/{id}             info + treatment + cycle + video manifest
GET  /api/diseases/{id}/cycle       the Section 8 object, resolved for a language
GET  /api/videos?disease_id=        signed HLS URLs
POST /api/orders                    → creates Razorpay order server-side
POST /api/orders/verify             signature check → marks paid → writes ledger entry
POST /api/webhooks/razorpay         independent, idempotent, signature-verified
GET  /api/ledger?since_seq=         paginated
GET  /api/ledger/verify             recomputes the whole chain, returns ok + first_break
GET  /api/ledger/{id}/proof         Merkle inclusion proof for one entry
GET  /healthz                       model loaded, db reachable, model_version
```

Keep the old `/predict`, `/diseases`, `/treatment/{name}` as thin 308-redirect shims
for one release so the deployed Vercel frontend does not hard-break mid-migration.

### 9.3 Inference path

Load the ONNX session **once** at startup. Preprocess per `meta.json`. Return top-3 +
confidence + `status`. Generate Grad-CAM on the same request (it is one extra forward
pass on a small model); store the overlay PNG to object storage and return its key —
the XR module needs it as a texture. Cap upload at 10 MB, validate real image bytes,
strip EXIF before storing.

### 9.4 The ledger — how it actually works

Append-only. There is no update or delete path in the code, and the DB user has no
`UPDATE`/`DELETE` grant on `ledger_entry`.

```
entry_hash = sha256(seq || created_at_iso || event_type || subject_id
                    || payload_sha256 || prev_hash)
```

`prev_hash` of entry _n_ is `entry_hash` of entry _n−1_; genesis uses 64 zeros.
Events written: `scan.created`, `scan.uncertain`, `order.created`, `order.paid`,
`order.refunded`, `consult.booked`, `module.unlocked`.

A nightly (or on-demand) job builds a Merkle tree over that day's entry hashes and
stores the root. `/api/ledger/verify` walks the chain and reports the first broken
link. **Ship a demo script** (`docs/demo.md`) that opens psql, tampers one payload,
and shows `/verify` catching it. That five-second demo is the entire justification for
this subsystem — make sure it works.

Stretch (Phase 5, flag-gated, default off): anchor the daily root to Polygon Amoy
testnet, store the tx hash. Behind `LEDGER_ANCHOR_ENABLED=false`.

### 9.5 Payments

Follow Section 4.8 exactly. Additionally:

- Amounts are integer paise, server-side, from the `product` table. The client sends a
  `product_id`, never a price.
- `webhook_event.rzp_event_id` is unique — that unique constraint _is_ the idempotency
  mechanism. Handle replays and out-of-order delivery (webhook may land before verify).
- An order becomes `paid` exactly once, from whichever path arrives first, in a
  transaction that also writes the ledger entry.
- Test-mode keys in `.env`, never committed. `.env.example` lists the names only.
- Tests: signature-valid, signature-invalid, duplicate webhook, webhook-before-verify,
  verify-before-webhook, refund.

---

## 10. PHASE 4A — FRONTEND (2D)

### 10.1 Do the design plan pass first — this is a required deliverable

Before writing any component, write `docs/design_plan.md`:

- **Colour**: 4–6 named hex values with roles.
- **Type**: one or two families, roles, and a type scale.
- **Layout**: one-sentence concept + ASCII wireframes for Scan, Result, Field-entry.
- **Principles**: what makes this specific to crop pathology and to nothing else.

Then review it against Section 4.4 and against your own first instinct: if any part is
what you would have produced for a generic "AI product" brief, revise it and write down
what changed and why. Only then start coding.

### 10.2 Direction (the brief — follow it, then make it yours)

The subject matter is **plant pathology documentation**: herbarium sheets, disease
plates, lesion-grading charts, extension-service field guides. Not "AI startup".
Not "clean SaaS".

Constraints, in priority order:

1. **Do not use the current warm-cream + Playfair combination.** Do not replace it with
   near-black + acid-green either. Both are on the tell list.
2. The colour system must be **derived from the domain**: healthy chlorophyll, chlorosis,
   necrosis, sporulation. These are _data_ colours — severity and confidence are encoded
   in them, so they earn their place. Choose one restrained neutral ground that is not
   `#F4F1EA`-family cream: cool paper, pale slate, or a genuinely dark ground with
   properly desaturated accents.
3. **One family, or two clearly distinct ones.** Not Playfair. Not Inter-as-default.
   Pick something with a point of view and set a real scale.
4. The one bold thing on the page is the **specimen** — the user's leaf photo with the
   Grad-CAM overlay and a lesion-severity scale beside it. Everything else stays quiet.
5. No ALL-CAPS eyebrows, no `·`-joined meta strings, no `→` glued to buttons, no
   identical cards with one shared shadow, no gradient decoration.
6. Tokens must be expressible as CSS custom properties, because **the XR module reads
   the same tokens** (Section 11.6). If a token can't survive being a colour on a 3D
   panel, it's the wrong token.

### 10.3 Routes

```
/                 Landing. Hero is a live specimen, not a headline slab.
/scan             Capture/upload. Camera-first on mobile. Photo-quality guidance
                  inline (fill the frame, diffuse light, one leaf, plain-ish backing) —
                  this directly reduces the abstain rate.
/scan/:id         Result: diagnosis, confidence, Grad-CAM toggle, top-3,
                  symptoms/organic/chemical/prevention, treatment videos,
                  ledger receipt, "Enter the field" CTA if cycle exists.
/diseases         Browse. Filter by crop.
/diseases/:id     Reference page + cycle summary (2D version of the XR content).
/field            XR entry: device check, headset instructions, desktop fallback,
                  module list. Lazy-loaded chunk.
/ledger           Public chain view + live verify button.
/orders/:id       Receipt.
/about            Honest methodology page: dataset mixture, lab-vs-field numbers,
                  the domain gap, the background-bias probe, limitations.
```

`/about` is not filler. Stating the field-accuracy gap plainly is the most credible
thing on the whole site.

### 10.4 Rules

- TypeScript everywhere. No `any` in committed code.
- No inline `style={{}}` except computed values (bar widths, transforms).
- Uncertain results get a distinct, calm treatment — never a red error state, and
  never a fake confident answer.
- Motion: one orchestrated moment maximum, plus state-change motion that shows what
  changed. No per-section fade-and-slide. `prefers-reduced-motion` respected.
- Accessibility floor: visible keyboard focus, real contrast, alt text, labelled
  controls, works down to 360 px.
- Bundle: `/field` must be a separate chunk. Landing must not download three.js.
  Budget: initial JS < 180 KB gzipped.
- EN/TE: extend the existing `LanguageContext` + JSON. Every new user-facing string in
  both. Telugu is a real feature for this audience, not a demo toggle.

---

## 11. PHASE 4B — THE XR MODULE

Route `/field`. Lazy chunk. Runs on Quest 3 Browser (primary), desktop Chrome with
Immersive Web Emulator (dev), and degrades to an orbit-controls 3D view with no headset.

### 11.1 Entry contract

From a scan: `/field?scan=<id>` → loads that diagnosis, that Grad-CAM, that cycle.
Standalone: browse mode, pick any disease with a cycle.
`status: "uncertain"` scans cannot enter. The button is disabled with an explanation.

### 11.2 Scene 1 — The Row (hub)

A short crop row, one species, ~10 m. Plants are **instanced** from 2–3 glTF variants
with a per-instance health attribute; the diagnosed plant is the one in front of you.
Three curved uikit panels at 1.2 m: **Diagnosis**, **Cycle**, **Treat**.

Locomotion: teleport only (drei/xr teleport). No smooth locomotion in v1 — it is the
main comfort risk and the row is small enough not to need it.

### 11.3 Scene 2 — Infection Theatre (the core of the product)

The diagnosed plant, scaled up, with a **timeline scrubber** and **three environment
dials** (temperature °C, leaf wetness hours, relative humidity %) bound to the
`environment` block from `disease_cycle.json`.

Behaviour:

- Play advances stage by stage through that pathogen's `stages` array.
- At each stage, the `requires` thresholds are checked against the dial values.
  If unmet, the stage **fails visibly** — spores fail to germinate, an X marker
  appears on the stage in the timeline, and the run halts with a plain-language line
  explaining which condition was missing.
- The **disease triangle** is drawn as a persistent HUD glyph with three legs
  (host / pathogen / environment) lighting up as each is satisfied. Break a leg,
  the cycle stops. This is the whole pedagogical point — make it unmissable.
- `interventions` appear as markers on the stages they act on. Applying one re-runs
  the timeline from that stage and shows the changed outcome.
- Stage VFX are **simple and instanced**: a spore point-cloud (single InstancedMesh
  or a points material), a lesion mask that grows via animated alpha on the leaf
  texture, a rain-splash or wind dispersal pass. No fluid sim, no volumetrics.
- The user's own Grad-CAM overlay is available as a texture on a leaf so the model's
  attention sits next to the simulated lesion.

Every visual claim in this scene traces to a field in `disease_cycle.json`. No invented
biology in shaders.

### 11.4 Scene 3 — Field Theatre (video)

360°/180° field footage of the real disease, plus flat treatment-technique clips.

- Use **WebXR Media Layers**: `XRMediaBinding` → `createEquirectLayer` for 360,
  `createQuadLayer` for flat, with `layout` set from `video.stereo`.
- Fall back to the WebXR Layers polyfill, then to a video texture on a sphere/plane.
- **One video playing at a time.** Enforce it in code.
- HLS via `hls.js` outside XR; check `MediaCapabilities` before choosing a rendition.
  Prefer h.265/AV1 for anything above 4K, and do not assume AV1 hardware decode on
  older Quest hardware.
- A "spot the symptom" mode: pause the 360 clip, user points at lesions, score against
  authored hotspots. Small, and it turns passive video into training.

### 11.5 Scene 4 — Treatment Bench

The `interventions` for this disease, performed: pick the right product, set the dose
from the treatment text, wear the PPE, apply at the correct stage. Grade it. Optionally
this is a paid module (`product.kind = "module"`) — that is how the transaction layer
touches XR without being a shop.

### 11.6 XR UI + tokens

`@react-three/uikit` panels reading the exact CSS custom properties from the 2D token
file, via a small shared TS token module imported by both. One palette, two renderers.
Apply every constraint from Section 4.6: 0.75–1.5 m, curved, inside 60°, angular type
sizing, opaque plate behind all text, delayed-follow if head-locked at all.

### 11.7 Performance budget — treat as acceptance criteria

- **72 FPS sustained on Quest 3 (13.7 ms/frame)** in the Infection Theatre with the
  full spore effect running. Measure with the in-headset performance HUD, not vibes.
- Draw calls under ~120. Merge static geometry; instance every repeated plant and spore.
- Multiview enabled. Fixed foveated rendering on for the heavy scene.
- glTF: Draco or meshopt compressed, KTX2/Basis textures, ≤2048 px, LODs on plants.
- Total XR chunk + assets ≤ 12 MB on first entry; stream the rest.
- Physics: none. Everything is animation and raycast.
- No per-frame allocations in `useFrame`. No `console.log` in the render loop.

**STOP GATE 3** — record a Quest screen capture of the Infection Theatre at 72 FPS with
the HUD visible before adding Scenes 3 and 4.

---

## 12. VIDEO PIPELINE

- Source clips are curated by me. You build the ingest script, not the content.
- `ml/../tools/transcode.sh`: ffmpeg → HLS ladder (1080p/2160p, and 4K equirect for
  360), h.264 baseline + h.265 renditions, 6 s segments, poster frame extraction.
- Output to object storage; register a `video` row with `projection` and `stereo` set.
- Signed URLs, 1 h expiry.
- Ship 2–3 placeholder clips (CC-licensed or self-shot) so the pipeline is testable
  end to end without waiting on content.

---

## 13. TESTING

- **API**: pytest. Inference smoke test against a fixture image. Ledger chain
  construction + tamper detection. All six payment cases from 9.5. Schema validation
  of `disease_cycle.json` for every non-healthy class.
- **ML**: deterministic manifest test (same seed → same split), export-contract test
  (three files exist, `meta.json` schema valid), ONNX-vs-PyTorch output parity within tolerance.
- **Web**: Vitest for token/util/state logic. One Playwright happy path:
  upload → result → order (Razorpay test card) → receipt → ledger entry visible.
- **XR**: no automated headset testing. Instead a written `docs/xr_test_plan.md`
  checklist run manually per release: comfort, panel distance, text legibility,
  teleport, video layer quality, frame rate, and a 5-minute wear test.

---

## 14. BUILD ORDER AND STOP GATES

| Phase | Deliverable                                                    | Gate                                        |
| ----- | -------------------------------------------------------------- | ------------------------------------------- |
| 0     | Ponytail + skills installed, `/grill-me` done, PRD + issues    | Show me the PRD                             |
| 1     | Deletion commit; repo restructure to pnpm workspace            | Show the tree, no code yet                  |
| 2     | ML: manifest → train → eval → export                           | **GATE 1**: four numbers + background probe |
| 3     | `disease_cycle.json` for apple/tomato/potato, schema-validated | **GATE 2**: review the biology with me      |
| 4     | API: scans + diseases + cycle + ledger. No payments yet        | Ledger tamper demo working                  |
| 5     | API: payments + webhooks + video registry                      | All six payment tests green                 |
| 6     | Web: design plan doc, then 2D rebuild                          | **GATE 3**: design plan before components   |
| 7     | XR: Row + Infection Theatre                                    | **GATE 4**: 72 FPS capture from Quest       |
| 8     | XR: Field Theatre + Treatment Bench                            | Manual XR checklist passed                  |
| 9     | Docs: README, model card, eval report, ADRs, demo script       | —                                           |
| 10    | _Optional_ Polygon Amoy anchoring, flag-gated                  | Only if 1–9 are solid                       |

Do not start a phase before its predecessor's gate is cleared. If you find yourself
scaffolding phase 7 while phase 2 is unfinished, stop and re-read this table.

---

## 15. DOCS TO PRODUCE

- `README.md` — rewritten. Headline metric is **field accuracy**, with the lab number
  and the gap next to it. Architecture diagram. Three surfaces explained. Honest
  limitations section.
- `docs/model_card.md` — data sources, licences, intended use, out-of-scope use,
  known failure modes, abstain behaviour.
- `docs/eval_report.md` — Section 7.3 output.
- `docs/dataset_card.md` — mixture, class distribution, dedup method.
- `docs/design_plan.md` — Section 10.1.
- `docs/adr/` — one ADR each for: hash-chained ledger over Fabric/Ethereum; ONNX over
  torch in the API; WebXR Media Layers over video textures; single app with a lazy XR
  chunk over a separate XR app.
- `docs/demo.md` — the 3-minute demo script: scan → diagnosis → enter field → break the
  cycle with a dial → buy the treatment kit in test mode → tamper the DB → verify catches it.

---

## 16. WHAT "DONE" LOOKS LIKE

A visitor can: photograph a diseased leaf, get a calibrated diagnosis that admits when
it doesn't know, read _why that plant got sick_ in plain language, put on a headset and
watch the pathogen's cycle run — then break it by changing one environmental condition,
buy the treatment in Razorpay test mode, and independently verify that the whole
sequence is recorded in a chain that visibly detects tampering.

Every number on the site is one I can defend in an interview.
