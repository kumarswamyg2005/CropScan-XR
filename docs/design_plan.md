> **SUPERSEDED (2026-09-04).** This plan described a replacement visual
> direction for the 2D app. That app has been removed and the original
> `frontend/` restored at the owner's request — see
> [ADR 0005](adr/0005-video-first-xr-and-restored-frontend.md). The document
> is kept because the review against the AI-design tells in section 6 is
> still a useful record of what was considered and why.

---

# Design plan — CropScan XR

Required deliverable, written before any component (PRD 8, Gate 3).

The subject matter is **plant pathology documentation**: herbarium sheets,
disease plates, lesion-grading charts, extension-service field guides. Not "AI
startup". Not "clean SaaS".

---

## 1. Concept

> **Every page is a herbarium mounting sheet.**
> A wide quiet margin, the specimen mounted large and slightly off-centre, and a
> typewritten determination label in the lower right carrying the
> identification, the confidence and the record hash.

A herbarium sheet is the original verifiable field record: a pressed specimen,
mounted, with a label stating *what it is, who determined it, when, and from
where*. That is the same object this product makes — a leaf photo becomes a
signed, timestamped determination. The metaphor is not decoration; it is
structurally the same artefact, which is why it earns the whole layout.

It also solves the brief's hardest constraint for free. Constraint 4 says the
one bold thing on the page is the specimen and everything else stays quiet. On a
mounting sheet that is not a design choice, it is what the object *is*.

---

## 2. Colour

Two groups. Neutrals carry the page; the tissue ramp carries data and nothing
else.

### Ground — cool paper, deliberately not cream

| Token | Hex | Role |
| --- | --- | --- |
| `--ground` | `#E8EBEE` | Page background. Cool blue-grey paper. |
| `--sheet` | `#F7F9FA` | The mounting sheet — cards, panels, the specimen plate. |
| `--ink` | `#14181C` | Body and headings. Near-black with a blue undertone. |
| `--ink-soft` | `#5A646E` | Secondary text, captions, determination metadata. |
| `--rule` | `#C3CBD2` | Ruling lines, borders, plate edges. Hairlines, not shadows. |

`#E8EBEE` is chosen against `#F4F1EA`: same lightness, opposite temperature. The
warm-cream signature named in PRD 4.4 depends on the warmth, so moving the
undertone blue removes it while keeping the paper reading.

### Tissue ramp — the data colours

Derived from what the model is actually looking at. These encode severity and
confidence, which is what earns them a place; they are never used as decoration,
never as a gradient, never as a brand accent.

| Token | Hex | Tissue state | Encodes |
| --- | --- | --- | --- |
| `--chlorophyll` | `#2F6B3A` | Healthy tissue | healthy / high confidence |
| `--chlorosis` | `#B8951C` | Yellowing | early or mild / medium confidence |
| `--necrosis` | `#7A3B22` | Dead tissue | severe |
| `--sporulation` | `#6B5E7A` | Fungal fruiting bloom | actively spreading |

Deliberately desaturated. PRD 4.4 rules out near-black plus acid-green; the
green here is a real leaf green at 25% saturation, not a signal green.

**Uncertain has no colour.** An uncertain result renders in `--ink-soft` on
`--sheet` with a hairline rule — calm, never red, never a fake confident answer
(PRD 8 / issue #32). Red is reserved for `--necrosis`, which means dead tissue,
not "error".

### Contrast

`--ink` on `--ground` is 15.4:1. `--ink-soft` on `--sheet` is 5.6:1. Every
tissue colour is used at ≥4.5:1 against `--sheet` when it carries text, and
paired with a text label whenever it carries meaning — colour is never the only
channel.

---

## 3. Type

Two clearly distinct families, both with a job.

**Archivo** — headings and body. A grotesque with a genuine point of view and a
real width range, drawn for signage and tables. Not Playfair (banned), not
Inter-as-default (banned).

**IBM Plex Mono** — determination data only: disease ids, confidence figures,
environmental thresholds, hashes, sequence numbers, timestamps.

The mono is not a style choice. A herbarium determination label is *typewritten*
— that is the visual convention this page is quoting. It also happens to be
functionally correct: a 64-character SHA-256 needs a monospace to be scannable,
and the environment dials are numeric readouts.

### Scale

Major third (1.25), 16px base.

| Step | Size | Line height | Use |
| --- | --- | --- | --- |
| `--t-xs` | 12px | 1.4 | Determination label metadata |
| `--t-sm` | 14px | 1.5 | Captions, table cells |
| `--t-base` | 16px | 1.6 | Body |
| `--t-md` | 20px | 1.4 | Lead paragraph, card titles |
| `--t-lg` | 25px | 1.25 | Section headings |
| `--t-xl` | 31px | 1.15 | Page titles |
| `--t-2xl` | 39px | 1.05 | Landing specimen caption |

Headings set at `-0.02em`. No tracked-out capitals anywhere.

---

## 4. Layout

### `/scan` — the empty sheet

```
┌──────────────────────────────────────────────────────────┐
│  CropScan XR                                    EN | TE  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│    ┌────────────────────────────────┐                    │
│    │                                │   Mounting a       │
│    │      [ drop or capture ]       │   specimen         │
│    │                                │   ───────────      │
│    │      dashed rule, no fill      │   Fill the frame   │
│    │                                │   Diffuse light    │
│    │                                │   One leaf         │
│    │                                │   Plain backing    │
│    └────────────────────────────────┘                    │
│                                                          │
│         [ Capture ]   [ Choose a photo ]                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Camera-first on mobile. The guidance sits beside the drop zone, not behind a
tooltip — it directly lowers the abstain rate, so it is primary content.

### `/scan/:id` — the mounted sheet

```
┌──────────────────────────────────────────────────────────┐
│  CropScan XR                                    EN | TE  │
├──────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────┐ ┌───────────────────┐ │
│  │                               │ │ DETERMINATION     │ │
│  │                               │ │ ───────────────── │ │
│  │        the specimen           │ │ Apple scab        │ │
│  │     (photo + Grad-CAM)        │ │ Venturia          │ │
│  │                               │ │   inaequalis      │ │
│  │                               │ │                   │ │
│  │                               │ │ conf.      0.94   │ │
│  │  [ photo | attention ]        │ │ model   cnxt@a1b2 │ │
│  └───────────────────────────────┘ │ seq          1284 │ │
│   severity  ▓▓▓▓▓▓░░░░  moderate   │ hash    3f9a…c210 │ │
│             healthy → necrotic     └───────────────────┘ │
│                                                          │
│  Symptoms · Organic · Chemical · Prevention  (tabs)      │
│                                                          │
│  ── How this plant got sick ──────────────────────────   │
│  Nine stages, the two that are gated right now marked.   │
│                                        [ Enter the field ]│
└──────────────────────────────────────────────────────────┘
```

The determination label is the herbarium quote made literal: identification,
confidence, model version, ledger sequence and hash, set in mono, ruled off.
It is also the ledger receipt — one component, two jobs, no duplication.

The severity scale beside the specimen is a lesion-grading chart: the tissue
ramp used as an actual measuring instrument, which is the justification for
having those four colours at all.

### `/field` — the entry plate

```
┌──────────────────────────────────────────────────────────┐
│  ← back to the determination                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   Field module                    ┌────────────────────┐ │
│   ─────────────                   │ WebXR    supported │ │
│   Walk the row. Run the           │ Headset  Quest 3   │ │
│   infection cycle. Break it       │ Scan     #1284     │ │
│   with one condition.             │ Cycle    9 stages  │ │
│                                   └────────────────────┘ │
│   [ Enter in VR ]  [ View on this screen ]               │
│                                                          │
│   ── Modules ────────────────────────────────────────    │
│   The Row              hub, teleport only                │
│   Infection Theatre    timeline + three dials            │
│   Field Theatre        360° footage        (phase 8)     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

When the scan is uncertain, "Enter in VR" is disabled and the reason sits
directly under it in `--ink-soft`, quoting the server's own
`field_blocked_reason` — the 2D and XR surfaces cannot disagree because neither
computes it.

---

## 5. Principles

1. **The specimen is the only loud thing.** Everything else is a hairline rule,
   mono metadata, or quiet body text.
2. **Colour is measurement.** The tissue ramp appears where a value is being
   encoded, and nowhere else. If a colour is not reporting something, it is
   `--ink`, `--ink-soft` or `--rule`.
3. **Hairlines, not shadows.** Plates are separated by 1px `--rule`. No card
   has a drop shadow. This is a documentation sheet, not a stack of floating
   panels.
4. **Numbers are typewritten.** Anything the model or the ledger asserts is set
   in mono, so an assertion always looks different from prose.
5. **Uncertainty is quiet, not alarming.** The system not knowing is a correct
   outcome, and it is styled as one.
6. **Every token survives being a colour on a 3D panel.** Flat hex values, no
   gradients, no alpha-dependent effects — the XR module imports the same token
   module (PRD 8 / issue #39). A token that only works as CSS is the wrong token.

---

## 6. Review against the AI-design tells

Checked against PRD 4.4, item by item.

| Tell | Status |
| --- | --- |
| Warm cream near `#F4F1EA` | Avoided. `#E8EBEE`, cool undertone. |
| High-contrast display serif (Playfair) | Avoided. Archivo grotesque + IBM Plex Mono. |
| Warm-clay accent | Avoided. `--necrosis` is a brown, but it is a data value with a defined meaning, never an accent. |
| Near-black + acid-green (the obvious overcorrection) | Avoided. Ground is light; the green is desaturated leaf green. |
| Tracked-out ALL-CAPS eyebrows | None. Section labels are sentence case at `--t-sm`. |
| `A · B · C` middot meta strings | None. Metadata is a two-column ruled table in the determination label. |
| Identical rounded cards, one shared `rgba(0,0,0,.1)` shadow | No shadows at all. Plates are ruled, and they differ in size and role. |
| `→` glued to button text | None. Buttons carry verbs: "Enter in VR", "Capture". |
| Fade-and-slide-up on every section | None. One orchestrated moment (the Grad-CAM crossfade), plus state-change motion. |
| Gradient decoration | None. |

### What changed from my first instinct, and why

My first pass was a dark editorial layout: near-black ground, a large serif
headline, the leaf photo full-bleed behind it, cards in a three-up grid. That is
the generic "AI product" brief with a plant photo dropped in, and it fails the
brief three ways — it is on the tell list, the colour would have been decorative
rather than encoded, and a dark ground makes a leaf photo unreadable because
lesion contrast is exactly what the user is trying to judge.

Three specific things changed:

1. **Dark ground → cool paper.** A pathology plate is read on paper, and the
   specimen has to be judged against a neutral, not glowed against black.
2. **Serif display headline → no display headline at all.** The landing hero is
   a live specimen with a mono determination label, not a headline slab (PRD 8).
   The sentence that would have been the headline is now the caption under the
   specimen, where it describes something real.
3. **Card grid → mounting sheet.** The three-up card grid was doing nothing the
   content asked for. The determination label replaced it and absorbed the
   ledger receipt at the same time, deleting a component instead of adding one.

---

## 7. Token source

One file, `apps/web/src/tokens.ts`, exporting plain hex strings, imported by:

- `apps/web/src/index.css` via a Tailwind v4 CSS-first `@theme` block
- the XR module's `@react-three/uikit` panels

One palette, two renderers. No `tailwind.config.js` colour duplication, and no
inline `style={{}}` except genuinely computed values such as bar widths and
transforms.
