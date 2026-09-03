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

> **Not yet trained.** The ML pipeline is written and tested end to end; the run
> itself needs a GPU (see [Status](#status)). The table below is filled in by
> `ml/eval.py`, never by hand, and `/about` renders it live from the deployed
> model's `meta.json`. Until a model exists, the site says so rather than
> showing a figure it cannot back.

| | |
| --- | ---: |
| **Field accuracy** (held-out, in-the-wild) | *pending* |
| Lab accuracy (PlantVillage-style) | *pending* |
| **Domain gap** | *pending* |
| Calibration error (ECE) | *pending* |
| Background-bias probe | *pending* |

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

**The XR module is 360° footage, not a 3D diorama.** A headset is excellent at
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
API_URL=http://127.0.0.1:8000 pnpm --filter crop-disease-detector dev
```

Video: `tools/transcode.sh clip.mp4 out/name --projection equirect` builds the
HLS ladder, then upload it under `videos/` and register the row with
`services/api/register_video.py`.

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
- **Treatment text is guidance, not a prescription.** Local resistance,
  registration and pre-harvest intervals vary, and wrong fungicide timing is a
  real cost.
- **The ledger proves the record was not altered. It does not prove the
  diagnosis was right**, nor that the operator did not fabricate it at write
  time — closing that second gap is what testnet anchoring is for, and it is
  Phase 10.
- **Payments are Razorpay test mode.** Nothing is charged.
- **`model.pt` (15.7 MB) is still in git history** from before the deletion
  commit. Removing it needs a history rewrite, which is opt-in.
- **The homepage still advertises 99.3% accuracy and EfficientNet-B0.** Both
  describe the deleted model. They must be replaced with the field number before
  this is published — see the note at the end of ADR 0005.
- **Field footage is a generated placeholder.** `tools/transcode.sh` and the
  registry work end to end; the clip itself is a synthetic equirect pattern
  until real orchard capture replaces it.

## Documentation

[PRD](docs/prd.md) · [issues](docs/issues.md) · [design plan](docs/design_plan.md) ·
[model card](docs/model_card.md) · [demo script](docs/demo.md) ·
[XR test plan](docs/xr_test_plan.md) · [ADRs](docs/adr/) ·
[design plan](docs/design_plan.md) (superseded)
