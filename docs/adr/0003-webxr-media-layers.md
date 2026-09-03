# ADR 0003 — WebXR Media Layers instead of in-scene video textures

**Status:** accepted · **Date:** 2026-09-03

## Context

The Field Theatre plays 360° field footage and flat treatment clips inside the
headset. The obvious implementation is a `VideoTexture` on a sphere.

That path makes the application resample the video into a GPU texture every
frame. At 4K equirect on a device with an 11–13 ms frame budget, it costs both
quality and headroom — and headroom is the scarce resource, since Quest is
CPU/draw-call bound before it is triangle bound.

## Decision

Use `XRMediaBinding` → `createEquirectLayer` for 360 and `createQuadLayer` for
flat, with `layout` set from the video row's `stereo` column. The compositor
samples the video once, at source resolution.

Three-step fallback, in order:

1. native `XRMediaBinding`
2. the WebXR Layers polyfill — this is what makes the module developable on
   desktop Chrome without a headset
3. a `VideoTexture` on a sphere or plane

`chooseStrategy()` is a pure function so all four paths are unit-tested without
a device.

## One video at a time

Quest decodes 4K on all formats and 8K only on h.265/AV1, and it plays **one**
video at a time — two concurrent 4K decodes do not degrade gracefully, they
stutter or fail.

This is enforced by `SingleVideoPlayback`, which pauses and releases the previous
element before starting a new one. It is a class rather than a convention because
"remember to pause the other one" is not a mechanism.

## Consequences

- Full-resolution video with lower GPU cost.
- Layer content is owned by the compositor, so nothing can be drawn over it
  from inside the scene. The disease-triangle HUD is hidden in the video scene
  for that reason, which is also the right call for legibility.
- Codec selection is explicit: h.264 up to 4K, h.265 above it. **AV1 hardware
  decode is not assumed** on older Quest hardware, so h.265 is the ceiling we
  actually rely on.
