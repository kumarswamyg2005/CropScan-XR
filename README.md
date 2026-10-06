# CropScan XR

**A leaf photo becomes a verifiable field record, and the disease that photo
shows can be stepped through in VR — infection to sporulation — with the weather
that caused it exposed as controls.**

One product, three surfaces, one API.

| Surface | What it is | For |
| --- | --- | --- |
| **Scan** (2D web) | Photograph a leaf → diagnosis, confidence, Grad-CAM, treatment | A farmer on a phone |
| **Field** (WebXR) | Watch the disease in 360° field footage while its infection cycle runs alongside — then stall it by changing one condition | Students, extension workers, agronomists |
| **Ledger** | Every scan and payment appended to a hash chain that visibly detects tampering | Farmer, buyer, auditor |

The through-line, and the thing that makes this not another CNN demo:

**diagnosis → causation → intervention → proof.**
The model says *what*. The XR module says *how it got there and how to break the
cycle*. The ledger says *this happened, at this time, on this image*.

---

## Accuracy: the honest number

> **Deployed model: EfficientNet-B0, 40 leaf classes plus "Not a leaf"** (training run `deploy4-field`).
> Trained on 19,805 images: 11,010 PlantVillage (capped at 300 per class), 7,395 field photos from
> 10 CC BY sources (PlantDoc; grape from GVLiD and FieldVitis; potato, Indonesia; corn, Tanzania;
> orange, Bangladesh and the HLB set; pumpkin as squash, Bangladesh; tomato, Bangladesh and Jaipur;
> soybean, Maharashtra) and 1,400 openly licensed COCO photos of people, objects and rooms. Healthy
> orange and healthy squash are field-only classes (PlantVillage has neither). PlantWild is
> CC-BY-NC-ND, so it is not in the deployed model's training data or epoch selection. The table is
> measured into `experiments/results/deploy4-field_metrics.json`, never typed by hand, and `/about`
> renders it live from the deployed `meta.json`. Test splits are never trained on.

| | Deployed | Lab-only baseline (`backend/model.pt`) |
| --- | ---: | ---: |
| **Field accuracy** (PlantDoc test, 236 photos) | **64.0%** | 14.8% |
| Field accuracy (PlantWild test, 1,502 photos; never trained on) | 43.9% | 12.7% |
| Lab accuracy (PlantVillage, 4,333 held-out) | 98.1% | 97.1% |
| **Domain gap** (lab − PlantDoc) | **34.1 pp** | 82.4 pp |
| Field macro-F1 (PlantDoc) | 0.636 | 0.163 |
| Calibration error (ECE, lab) | 0.004 | 0.005 |
| Face photos refused (500, LFW) | 100.0% | 98.6% |

Test splits drawn from the same farms as the training photos (grape, potato, and the v4 sources)
score 94–100%, but on a farm left out of training field accuracy is about 31–33%
(leave-one-source-out runs). Treat same-source numbers as optimistic. **Known weakness:** healthy
corn photographed as a whole plant or a field scene (not a leaf close-up) is still often called
northern leaf blight; the corn field photos in training are mostly diseased.

Two gates refuse a photo: the model answering "Not a leaf", and a confidence + entropy
threshold. The threshold was tuned to refuse at least 90% of Imagenette (no plants), then
raised until at least 80% of the answers given on PlantDoc validation photos are right. With
both gates, 98.9% of Imagenette, 100.0% of 400 unseen COCO photos and all 500 faces are refused.
On real field photos (PlantDoc test) the site answers 57.6% of them and
83.1% of those answers are right; the rest get "retake the photo".

**The field number is the headline. The lab number is context.**

The previous version of this project reported 99.3% accuracy. That was a
PlantVillage number: 54,306 images on uniform backgrounds in controlled
conditions. Models trained that way routinely collapse outdoors — 99.35% → 31.4%
(Ferentinos 2018), 99.72% → 41.81% (Gui et al. 2021) — and analysis shows they
frequently key on the **background** rather than the lesion.

So this rebuild trains on a lab-plus-field mixture, evaluates on a field-only
test split that is never used for model selection, and publishes the gap.
It also rescores the field set **with the leaf masked out**: whatever the model
still gets right there is accuracy that is not coming from the plant. That plot
is the most interesting one in the project and it goes on the public methodology
page either way.

---

## Architecture

```
                        ┌──────────────────────────────┐
   phone / desktop ───► │  frontend    React 18 + Vite  │
                        │  ───────────────────────────  │
                        │  /  /detect  /result  /about  │
                        │  /field ── lazy chunk ───────┼──► three.js
                        └──────────────┬───────────────┘    @react-three/xr
                                       │ HTTP           360° video, Quest 3
                        ┌──────────────▼───────────────┐
                        │  services/api   FastAPI       │
                        │  ───────────────────────────  │
                        │  onnxruntime   (no PyTorch)   │
                        │  hash-chained ledger          │
                        │  Razorpay (test mode)         │
                        └────┬──────────────────┬───────┘
                             │                  │
                    ┌────────▼──────┐   ┌───────▼────────┐
                    │  PostgreSQL   │   │  S3 / MinIO    │
                    │  append-only  │   │  images, HLS   │
                    └───────────────┘   └────────────────┘

   ml/  ──── model.onnx + labels.json + meta.json ────►  services/api/model/
        (trained on Kaggle; never imported by the API)
```

**Repo layout**

```
frontend/           React app; 2D routes plus the lazy /field video-XR route
services/api/       FastAPI, Alembic, tests
ml/                 training, eval, export — own requirements.txt
data/               taxonomy, manifests, disease_cycle.json, disease_info.json
docs/               ADRs, model card, design plan, demo script
infra/              docker-compose (postgres + minio)
tools/              video transcode pipeline
eval/               research paper: benchmark suite, results, LaTeX source
backend/            PlantVillage EfficientNet-B0 baseline (model.pt, class_names.json)
                    — the paper's deployed baseline; eval/ loads it from here
ml/train.ipynb      the Kaggle notebook that trained that baseline
```

---

## What is actually interesting here

**The abstain path.** Below a tuned max-softmax *and* entropy threshold, the API
returns no diagnosis at all and the XR module refuses to launch. Narrating a
pathogen's life cycle for the wrong pathogen is the worst thing this system
could do, so not answering is a designed outcome — enforced by a database check
constraint, not just by application code.

**The disease cycle is data, not animation.** `data/disease_cycle.json` holds
fourteen diseases across apple, tomato and potato, each with the nine canonical
stages, the environmental thresholds that gate them, interventions bound to the
stage they act on, and a citation on every entry. The simulator is the disease
triangle wired to three sliders: drop leaf wetness below *Venturia inaequalis*'s
nine hours and the cycle **visibly halts** at germination, in the headset and on
the page, with the same sentence. That number comes from the Mills table via the
JSON, not from a shader.

**The footage is the real pathogen, tied to the stage it illustrates.**
`data/video_catalogue.json` maps CC-licensed research footage to diseases and to
cycle stages: *Phytophthora* zoospores swimming for the stage where late blight
needs free water, whiteflies being manipulated by the virus they carry for
TYLCV's vector stages, a fungus trafficking effectors into a host cell for the
invisible incubation window that makes protectant timing matter. Licence and
attribution are columns on the row, and the player renders them.

**The XR module is video, not a 3D diorama.** A headset is excellent at
putting you in a real orchard and poor at procedural greenery, so the footage is
the experience and the cycle rides over it on flat panels. Video goes through
WebXR Media Layers so the compositor samples it once at source resolution, and
one clip plays at a time because two 4K decodes on Quest do not degrade
gracefully. See [ADR 0005](docs/adr/0005-video-first-xr-and-restored-frontend.md).

**Tamper-evidence you can demonstrate in five seconds.** Edit one payload in
psql, press verify, watch it name the broken entry. Recompute the hash to cover
your tracks and the break just moves to the next entry. `docs/demo.md` is the
script.

**Payments that survive the races.** All four Razorpay steps, amounts read
server-side from the product table, and the unique constraint on
`webhook_event.rzp_event_id` as the idempotency mechanism rather than a
select-then-insert. All six race cases are tested, including webhook-before-verify.

---

## Running it

```bash
# infrastructure
docker compose -f infra/docker-compose.yml up -d

# api
cd services/api
pip install -r requirements.txt
alembic upgrade head
python seed.py
uvicorn app.main:app --reload --port 8000

# web  (API_URL only if the API is not on :8000)
pnpm install
API_URL=http://127.0.0.1:8000 pnpm --filter crop-disease-detector dev   # http://localhost:5199
```

The dev server runs on **5199**, not Vite's default 5173. A service worker
registered by an unrelated project on `localhost:5173` was intercepting every
request and serving its own cached app, which no amount of restarting this
server could fix. Override with `PORT=... pnpm dev` if you need to.

Video: `python tools/ingest_catalogue.py` downloads everything in
`data/video_catalogue.json`, builds the HLS ladder, uploads it and registers the
rows. It refuses any entry without attribution, because most of the footage is
CC BY or CC BY-SA and attribution is a licence condition, not a nicety.

`/healthz` reports whether the model, database and object storage are reachable.
The API runs without a model — `/api/scans` returns 503 and everything else
works.

### Tests

```bash
pytest services/api/tests ml/tests     # 123 passing
pnpm --filter crop-disease-detector test   # 32 passing
pnpm --filter crop-disease-detector build
```

### Training

```bash
pip install -r ml/requirements.txt
python ml/data/build_manifest.py --report-unmapped   # fill in data/taxonomy.yaml
python ml/data/build_manifest.py
python ml/train.py --model convnext_tiny
python ml/eval.py --checkpoint ml/runs/<run>/best.pt
python ml/export.py --checkpoint ml/runs/<run>/best.pt
```

`export.py` refuses to run without tuned abstain thresholds, so an unmeasured
model cannot get behind the API.

---

## Status

| Phase | State |
| --- | --- |
| Deletion and restructure | done |
| ML pipeline (manifest, train, eval, export, OOD) | code complete, **needs a GPU run** |
| Disease-cycle knowledge base (apple, tomato, potato) | done, 14 diseases, sourced |
| API: scans, diseases, cycle, ledger | done |
| API: payments, webhooks, video registry | done |
| Web: original design, rewired to the new API | done |
| XR: 360° video theatre + cycle overlay | done, **needs a 72 FPS capture on Quest** |
| Docs | done |
| Polygon Amoy anchoring (optional) | not started, flag-gated |

Two things need hardware that the build did not have: a GPU for training, and a
Quest 3 for the frame-rate gate.

---

## Limitations

- **38 classes, limited crops.** Anything outside them is refused if the abstain
  path fires, or filed as the nearest known class if it does not.
- **Disease cycles cover apple, tomato and potato only.** Other diagnoses return
  `cycle: null` and cannot enter the field module. A rigorous three beats a
  shallow thirty-eight.
- **Five languages: English, Telugu, Hindi, Tamil, Kannada.** The UI
  (`frontend/src/locales/`), disease advice (`data/translations_*.json`) and
  stage names (`data/stage_labels.json`) are translated. The Hindi, Tamil and
  Kannada text was drafted with AI assistance and needs a native-speaker
  agronomist's review before farmers rely on it. Per-stage descriptions,
  intervention text and video captions are still English only.
- **Treatment text is guidance, not a prescription.** Local resistance,
  registration and pre-harvest intervals vary, and wrong fungicide timing is a
  real cost.
- **The ledger proves the record was not altered. It does not prove the
  diagnosis was right**, nor that the operator did not fabricate it at write
  time — closing that second gap is what testnet anchoring is for, and it is
  Phase 10.
- **Payments are Razorpay test mode.** Nothing is charged.
- **`backend/model.pt` (15.7 MB) is committed** because the paper's
  benchmarks in `eval/` load it. The API does not use it; it serves
  `services/api/model/model.onnx`.
- **The homepage still advertises 99.3% accuracy and EfficientNet-B0.** Both
  describe the deleted model. They must be replaced with the field number before
  this is published — see the note at the end of ADR 0005.
- **Two diseases still have no footage**: tomato bacterial spot and tomato
  mosaic virus. A bacterium and a mechanically transmitted virus are both hard
  to film, and nothing reusable exists. The fungal-infection clip is
  deliberately not mapped to them — it would be showing the wrong kind of
  pathogen. Those two fall back to the cycle board.
- **There is no real 360° crop-disease footage in the catalogue.** It does not
  appear to exist under a reusable licence — the closest published work, the
  TNAU downy-mildew VR module, is not distributed. The seven real clips are
  CC-licensed pathogen footage (flat), which plays on a WebXR quad layer in the
  headset. One synthetic equirect clip keeps the 360 code path exercised until
  real orchard capture replaces it.
- **CC BY-SA footage makes HLS renditions share-alike derivatives.** Fine for a
  portfolio build; check before anything commercial.

## Documentation

[PRD](docs/prd.md) · [issues](docs/issues.md) · [design plan](docs/design_plan.md) ·
[model card](docs/model_card.md) · [demo script](docs/demo.md) ·
[XR test plan](docs/xr_test_plan.md) · [ADRs](docs/adr/) ·
[design plan](docs/design_plan.md) (superseded)
