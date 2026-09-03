# CropScan XR — Issue List

Derived from `docs/prd.md`. Build issue-by-issue, in order. Do not start a phase
before its predecessor's gate is cleared.

Legend — **B** blocked on owner · **C** Claude can complete in-session · **H** needs hardware

---

## Phase 1 — Demolition and restructure

### #1 Deletion commit  · C
Delete, do not comment out:
```
backend/model.py            4-path fallback loader
backend/model.pt            15.7 MB weights
backend/class_names.json
class_names.json            root duplicate (verified byte-identical)
ml/train.ipynb
training_curves (2).png
```
Strip `torch` / `torchvision` / the pytorch `--extra-index-url` from
`backend/requirements.txt`.

**Keep** `disease_info.json` (38 classes, hand-written) and
`translations_te.json` (38 keys). They migrate to `data/`, then to the DB.

**AC** — Nothing else in this commit. Plain commit message describing the
deletion. No AI attribution (PRD D5).

### #2 `/predict` becomes an honest stub · C
`backend/main.py` keeps its shape, loses every model import, and `/predict`
returns **503** until Phase 2 lands.

**AC** — No random-weight fallback model anywhere. Silently returning garbage
predictions is worse than an error. `/diseases` and `/treatment/{name}` keep
working off `disease_info.json`.

### #3 pnpm workspace restructure · C
Create `services/api/`, `ml/`, `data/`, `docs/`, `infra/`. Move the backend into
`services/api/`. Move `disease_info.json` + `translations_te.json` into `data/`.

**Per PRD D3: `frontend/` does not move in this phase.** It moves in #30 as part
of the TypeScript migration.

**AC** — `.gitignore` currently ignores all of `data/` — narrow it so manifests,
`taxonomy.yaml` and the content JSON are tracked while images are not. Tree
matches PRD §7 minus `apps/web`.

### #4 `infra/docker-compose.yml` · C
Postgres + MinIO only. No Redis, no queue (PRD §3).

**AC** — `docker compose up` gives a reachable DB and object store. `.env.example`
lists variable names only; no secrets committed.

> **GATE**: show the tree. No application code yet.

---

## Phase 2 — ML rebuild

### #5 `data/taxonomy.yaml` · C
Class taxonomy defined **once**, mapping every source's raw label to a canonical
`crop___condition` id. Sources disagree on naming; resolve it here, never in
training code.

**AC** — Every PlantVillage, PlantDoc and PlantWild raw label maps to exactly one
canonical id, or is explicitly excluded with a reason.

### #6 `ml/data/build_manifest.py` · C
Emits `data/manifests/{train,val,test_lab,test_field}.csv` with columns
`path, label, source, split, domain(lab|field)`. Deterministic seed.

Target mixture ≈ ⅓ lab / ⅔ field (the validated prior art). Subsample
PlantVillage against the 43% tomato skew. Cap per-class training count.

**AC** — `test_field` is field images only and is **never** used for model
selection. Splits are by image group where possible so near-duplicates do not
straddle splits. Same seed → identical split (this is a test, #12). Final class
distribution logged to `docs/dataset_card.md`.

### #7 `ml/train.py` · C to write · B to run
`convnext_tiny` or `efficientnetv2_s` from timm, ImageNet-pretrained. **One**
comparison against the old EfficientNet-B0 baseline, picked on `test_field`.
No model zoo.

Augmentation attacks background bias directly: random resized crop, colour
jitter, random shadow, motion blur, JPEG artefacts, coarse dropout, background
replacement where segmentation is cheap.

Two-phase fine-tune (head, then full at lower LR), cosine schedule, label
smoothing, early stop on val macro-F1.

**AC** — Logs to CSV + matplotlib. **No W&B, no MLflow, no tracker.** Owner runs
this on Kaggle/Colab (PRD D2).

### #8 `ml/eval.py` → `docs/eval_report.md` · C to write · B to run
Must emit all six:
1. Accuracy + macro-F1 on `test_lab` **and** `test_field` side by side, with the
   **domain gap** as a headline number.
2. Per-class F1 table, worst 10 called out.
3. Confusion matrix (field).
4. Calibration: reliability diagram + ECE.
5. **Background-bias probe** — score a held-out set with the leaf masked out. If
   the model still beats chance, report it.
6. Abstain-rate curve.

### #9 `ml/ood.py` — abstain thresholding · C
Max-softmax + entropy, tuned on a rejection set (random non-leaf photos, blurred
leaves, hands, soil).

**AC** — Threshold is written into `meta.json`, never hardcoded server-side.

### #10 `ml/export.py` · C
Produces exactly three files into `services/api/model/`: `model.onnx` (opset 17,
fp32, dynamic batch, simplified), `labels.json`, `meta.json` per PRD §7.1.

### #11 Grad-CAM at export time · C
`pytorch-grad-cam` or a ~30-line hook implementation. Target layer recorded in
`meta.json` as `gradcam_layer`.

### #12 ML tests · C
Deterministic manifest test (same seed → same split); export-contract test
(three files exist, `meta.json` schema valid); ONNX-vs-PyTorch output parity
within tolerance; ONNX smoke test — fixed image → fixed top-1 within tolerance.

> **GATE 1**: lab acc, field acc, the gap, ECE, and the background-probe result.
> If field accuracy is under ~70% we change the dataset mixture, **not the story**.

---

## Phase 3 — Disease-cycle knowledge base

### #13 `data/disease_cycle.json` — apple, tomato, potato only · C
Keyed by canonical class id. Per PRD §4.3 stage list. Schema per prompt §8:
`pathogen`, `primary_inoculum`, `overseasoning`, `stages[]` (with `requires`
thresholds, `visible`, `vfx`, `label_te`), `environment`, `dispersal`,
`cycle_type`, `interventions[]`, `sources[]`.

**AC** — **Every field is sourced.** This is agronomic advice; a wrong fungicide
timing is a real cost to a real person. Three crops done rigorously beats a
shallow 38. `requires` thresholds drive simulator stage gating; `null` means
unconstrained. Healthy classes get **no** entry — API returns `cycle: null`.

### #14 Pydantic model + schema test · C
Validates every entry. Test asserts every non-healthy class **in the shipped
subset** has an entry, and that every `interventions[].stage_id` resolves to a
real stage in that entry.

> **GATE 2**: review the biology with the owner before any 3D work.

---

## Phase 4 — API: scans, diseases, cycle, ledger

### #15 SQLAlchemy models + first Alembic migration · C
`scan`, `ledger_entry`, `merkle_root`, `product`, `order`, `webhook_event`,
`video` per prompt §9.1.

### #16 Inference path · C
Load the ONNX session **once** at startup. Preprocess per `meta.json`.

**AC** — Cap upload at 10 MB. Validate real image bytes, not just content-type.
**Strip EXIF before storing.** Return top-3 + confidence + `status`.

### #17 Grad-CAM on the scan request · C
One extra forward pass. Store the overlay PNG to object storage, return its key —
the XR module needs it as a texture.

### #18 Disease + cycle endpoints · C
`GET /api/diseases` (with `has_cycle` / `has_video` flags),
`GET /api/diseases/{id}`, `GET /api/diseases/{id}/cycle` (resolved for a language).

### #19 The ledger · C
Append-only. **No update or delete path in code**, and the DB user gets no
`UPDATE`/`DELETE` grant on `ledger_entry`. Hash chain per PRD §7.2. Daily Merkle
root job (on-demand trigger too).

`GET /api/ledger?since_seq=`, `GET /api/ledger/verify` (recomputes the whole
chain, returns ok + `first_break`), `GET /api/ledger/{id}/proof` (Merkle
inclusion proof).

### #20 Ledger tests + tamper demo · C
Chain construction, tamper detection, Merkle proof verification.

**AC** — `docs/demo.md` includes a script that opens psql, tampers one payload,
and shows `/verify` catching it. **That five-second demo is the entire
justification for this subsystem — make sure it works.**

### #21 Legacy redirect shims · C
Keep `/predict`, `/diseases`, `/treatment/{name}` as thin **308** redirects for
one release so the deployed Vercel frontend does not hard-break mid-migration.

### #22 `GET /healthz` · C
Reports model loaded, DB reachable, `model_version`.

> **GATE**: ledger tamper demo working.

---

## Phase 5 — Payments and video registry

### #23 `POST /api/orders` — server-side order creation · C
**AC** — Amounts are integer paise read **from the `product` table**. The client
sends a `product_id`, **never a price**.

### #24 `POST /api/orders/verify` · C
`hmac_sha256(order_id + "|" + payment_id, key_secret)`. On success, mark paid and
write the ledger entry **in the same transaction**.

### #25 `POST /api/webhooks/razorpay` · C
Independent of the verify path, signature-verified, idempotent.

**AC** — `webhook_event.rzp_event_id` unique constraint **is** the idempotency
mechanism. Handles replays and out-of-order delivery. An order becomes `paid`
exactly once, from whichever path arrives first.

### #26 The six payment tests · C
signature-valid · signature-invalid · duplicate webhook · webhook-before-verify ·
verify-before-webhook · refund.

### #27 Video registry + `GET /api/videos` · C
Signed HLS URLs, 1 h expiry. `projection` and `stereo` set per row.

### #28 `tools/transcode.sh` · C
ffmpeg → HLS ladder (1080p/2160p, 4K equirect for 360), h.264 baseline + h.265
renditions, 6 s segments, poster extraction. Ship 2–3 CC-licensed placeholder
clips so the pipeline is testable end to end without waiting on content.

> **GATE**: all six payment tests green.

---

## Phase 6 — Web (2D)

### #29 `docs/design_plan.md` — required deliverable, before any component · C
Colour (4–6 named hex with roles) · Type (one or two families, roles, scale) ·
Layout (one-sentence concept + ASCII wireframes for Scan, Result, Field-entry) ·
Principles (what makes this specific to crop pathology and nothing else).

Then review it against PRD §4.4 **and against your own first instinct**: if any
part is what you would have produced for a generic "AI product" brief, revise it
and **write down what changed and why**.

**AC** — Not warm-cream + Playfair. Not near-black + acid-green. Colour derived
from the domain (chlorophyll, chlorosis, necrosis, sporulation) used as **data**,
not decoration (PRD D7). Tokens expressible as CSS custom properties — **the XR
module reads the same tokens**. If a token can't survive being a colour on a 3D
panel, it's the wrong token.

> **GATE 3**: design plan reviewed before a single component is written.

### #30 TypeScript migration — `frontend/` → `apps/web/` · C
The move deferred from #3. React 19 + TS + Vite, Tailwind v4 CSS-first `@theme`,
React Router v7, TanStack Query.

**AC** — No `any` in committed code. No inline `style={{}}` except genuinely
computed values (bar widths, transforms). One token source — no
`tailwind.config.js` colour duplication.

### #31 Routes · C
`/` · `/scan` · `/scan/:id` · `/diseases` · `/diseases/:id` · `/field` ·
`/ledger` · `/orders/:id` · `/about`

**AC** — `/scan` is camera-first on mobile with inline photo-quality guidance
(fill the frame, diffuse light, one leaf, plain-ish backing) — this directly
reduces the abstain rate. `/about` states the dataset mixture, lab-vs-field
numbers, the domain gap, the background-bias probe and the limitations.

### #32 Uncertain-result treatment · C
**AC** — Distinct and calm. **Never a red error state, never a fake confident
answer.** The "Enter the field" CTA is disabled with a plain explanation.

### #33 Motion, a11y, bundle budget · C
**AC** — One orchestrated moment maximum plus state-change motion that shows what
changed. No per-section fade-and-slide. `prefers-reduced-motion` respected.
Visible keyboard focus, real contrast, alt text, labelled controls, works down to
360 px. `/field` is a **separate chunk** — the landing page must not download
three.js. Initial JS < 180 KB gzipped.

### #34 EN/TE · C
Extend the existing `LanguageContext` + JSON. No i18next.

**AC** — Every new user-facing string in both languages. Telugu is a real feature
for this audience, not a demo toggle.

### #35 Vitest + one Playwright happy path · C
upload → result → order (Razorpay test card) → receipt → ledger entry visible.

---

## Phase 7 — XR: Row + Infection Theatre

### #36 `/field` entry contract · C
`/field?scan=<id>` loads that diagnosis, that Grad-CAM, that cycle. Standalone =
browse mode. Degrades to orbit-controls 3D with no headset.

**AC** — **`status: "uncertain"` scans cannot enter.** Button disabled with an
explanation.

### #37 Scene 1 — The Row · C
~10 m crop row, one species. Plants **instanced** from 2–3 glTF variants with a
per-instance health attribute; the diagnosed plant is in front of you. Three
curved uikit panels at 1.2 m: Diagnosis, Cycle, Treat.

**AC** — **Teleport only.** No smooth locomotion in v1 — it is the main comfort
risk and the row is small enough not to need it.

### #38 Scene 2 — Infection Theatre · C
Timeline scrubber + three environment dials (temp °C, leaf wetness hr, RH %)
bound to the `environment` block from `disease_cycle.json`.

**AC**
- Play advances stage by stage through that pathogen's `stages` array.
- At each stage, `requires` is checked against the dials. Unmet → the stage
  **fails visibly**: spores fail to germinate, an X marks the stage on the
  timeline, the run halts with a plain-language line naming the missing condition.
- The **disease triangle** is a persistent HUD glyph with three legs lighting up
  as each is satisfied. Break a leg, the cycle stops. **Make it unmissable —
  this is the whole pedagogical point.**
- `interventions` are markers on the stages they act on. Applying one re-runs the
  timeline from that stage and shows the changed outcome.
- The user's own Grad-CAM sits as a texture on a leaf, next to the simulated lesion.
- VFX simple and instanced: spore point-cloud, lesion mask growing via animated
  alpha, rain-splash/wind pass. **No fluid sim, no volumetrics.**
- **Every visual claim traces to a field in `disease_cycle.json`. No invented
  biology in shaders.**

### #39 XR tokens · C
`@react-three/uikit` panels read the **exact** CSS custom properties from the 2D
token file via a small shared TS token module imported by both. One palette, two
renderers. Every PRD §4.6 constraint applied.

### #40 Performance budget — acceptance criteria, not aspiration · C to build · H to verify
72 FPS sustained on Quest 3 (13.7 ms/frame) in the Infection Theatre with the
full spore effect. Draw calls under ~120. Multiview on. Fixed foveated rendering
on for the heavy scene. glTF Draco/meshopt compressed, KTX2/Basis textures
≤2048 px, LODs on plants. XR chunk + assets ≤ 12 MB on first entry. **No
physics.** No per-frame allocations in `useFrame`. No `console.log` in the render
loop.

> **GATE 4**: Quest screen capture of the Infection Theatre at 72 FPS with the
> performance HUD visible, recorded by the owner (PRD §6 — no headset in-session).

---

## Phase 8 — XR: Field Theatre

### #41 Scene 3 — Field Theatre · C
**WebXR Media Layers**: `XRMediaBinding` → `createEquirectLayer` for 360,
`createQuadLayer` for flat, `layout` from `video.stereo`. Fall back to the Layers
polyfill, then to a video texture on a sphere/plane.

**AC** — **One video playing at a time, enforced in code.** HLS via `hls.js`
outside XR. Check `MediaCapabilities` before choosing a rendition. Prefer
h.265/AV1 above 4K; do not assume AV1 hardware decode on older Quest hardware.

### #42 "Spot the symptom" mode · C
Pause the 360 clip, user points at lesions, score against authored hotspots.
Small, and it turns passive video into training.

### #43 Scene 4 — Treatment Bench · **STRETCH, deferred (PRD D6)**
Demoted at the Phase 0 grill: fourth XR scene, teaches dose-setting with no dose
field in the §8 schema to validate against, weakest link to the through-line.
Revisit at Gate 4.

### #44 `docs/xr_test_plan.md` · C to write · H to run
Manual checklist run per release — no automated headset testing. Comfort, panel
distance, text legibility, teleport, video layer quality, frame rate, 5-minute
wear test.

> **GATE**: manual XR checklist passed.

---

## Phase 9 — Docs

### #45 `README.md` rewritten · C
**AC** — Headline metric is **field accuracy**, with the lab number and the gap
next to it. Architecture diagram. Three surfaces explained. Honest limitations.

### #46 `docs/model_card.md` · C
Data sources, licences, intended use, out-of-scope use, known failure modes,
abstain behaviour.

### #47 `docs/adr/` — four ADRs · C
Hash-chained ledger over Fabric/Ethereum · ONNX over torch in the API · WebXR
Media Layers over video textures · single app with a lazy XR chunk over a
separate XR app.

### #48 `docs/demo.md` — the 3-minute script · C
scan → diagnosis → enter field → break the cycle with a dial → buy the treatment
kit in test mode → tamper the DB → verify catches it.

---

## Phase 10 — Optional

### #49 Polygon Amoy anchoring · C
Anchor the daily Merkle root to testnet, store the tx hash.

**AC** — Behind `LEDGER_ANCHOR_ENABLED=false`. Only if Phases 1–9 are solid.

---

## Cut order

If time runs out, cut in this order — the demo-critical spine is
**1 → 3 → 4 → 6 → 7**:

1. #49 Polygon anchoring
2. #43 Treatment Bench (already deferred)
3. #42 Spot-the-symptom
4. Phase 5 payments (#23–#28) — the ledger demo stands without them
5. Phase 8 Field Theatre (#41)
