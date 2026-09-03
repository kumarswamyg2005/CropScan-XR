# ADR 0005 — The XR module is a video theatre, and the original frontend stays

**Status:** accepted · **Date:** 2026-09-04 · **Supersedes:** parts of ADR 0004,
and `docs/design_plan.md` in full

## Context

Two decisions from the rebuild were reversed after seeing them running.

**The XR module was a procedural 3D crop row.** Plants were instanced from
primitives — a deliberate call to keep the chunk small and avoid sourcing glTF
assets. On screen they read as green blobs. A headset is exceptionally good at
360° footage of a real place and poor at low-poly greenery, and the module was
leading with the thing the medium is worst at. The disease-cycle logic was
sound; the thing wrapped around it was not.

**The 2D app had been rebuilt from scratch.** The original brief (`prompt.md`
§4.4) identified the existing warm-cream + Playfair palette as an AI-generated
design signature and required replacing it, which is what happened. The
replacement was a colder, sparser documentation aesthetic. The owner preferred
the original.

## Decision

**The XR module is a video theatre.** 360°/180° footage of the real disease is
the experience. The infection cycle rides over it as flat panels: a stage
timeline, the halt message, and the disease-triangle glyph. The procedural crop
row, the 3D plant and the Infection Theatre scene are deleted.

**The original `frontend/` is restored** from `282aaae` and remains the app.
`apps/web` is deleted. The new `/field` route is written in the original app's
visual language — cream ground, Playfair headings, the existing button classes
and CSS custom properties.

## Consequences

**What was kept.** The two pieces of logic worth keeping were ported to
JavaScript with their tests intact:

- `cycleMachine.js` — the disease-triangle stage machine. Still pure, still
  reads only `data/disease_cycle.json` plus three dial values, so no claim shown
  over the footage can drift from the knowledge base. 18 tests.
- `videoLayer.js` — media-layer selection, codec choice, and the
  one-video-at-a-time rule. 14 tests.

**What was lost.** The token module that let the 2D app and the uikit panels
share one palette. The restored app uses CSS custom properties and the scene
uses hex constants that match them; keeping them in step is now a manual job.
Accepted, because the scene has four colours in it.

**What got simpler.** No plant models to source, no LOD chain, no draw-call
budget to defend on procedural geometry. The frame-budget question becomes a
video decode question, which the platform answers for us. ADR 0003 (media
layers over video textures) moves from a detail to the centre of the design.

**The bundle argument from ADR 0004 still holds** and still applies: `/field` is
a dynamic import, three.js is not in the entry, and the landing page does not
download it. The specific `manualChunks` trap documented there is now a comment
in `frontend/vite.config.js` so it does not get reintroduced.

## Not re-litigated

`prompt.md` §4.4's argument about the cream + Playfair palette is unchanged and
was not wrong; the owner weighed it and chose the original design anyway. That
is a preference call, not a factual one, and it is theirs to make.

One factual issue does remain and is tracked separately: the restored homepage
advertises **99.3% test accuracy** and **EfficientNet-B0**, both of which
describe the deleted model. Whatever replaces it will have a different backbone
and a lower, field-measured number. Those two strings need updating before the
site is published.
