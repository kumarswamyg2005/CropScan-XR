# ADR 0004 — One app with a lazy XR route, not a separate XR application

**Status:** accepted · **Date:** 2026-09-03

## Context

The XR module needs three.js, `@react-three/fiber`, `drei`, `@react-three/xr`
and `uikit` — well over a megabyte gzipped. A farmer opening the site on a phone
to photograph a leaf must never pay for any of it.

The alternative is a second application at its own origin.

## Decision

One app. `/field` is a `React.lazy` route and everything three.js lives at or
below `src/field/`.

A separate XR app would have duplicated the API client, the language context and
the whole token system — and the token system is exactly what must not fork,
because the uikit panels in the headset read the same palette as the 2D pages.

## Consequences

- Initial JS is **96 KB gzipped** against a 180 KB budget. The XR chunk is
  ~321 KB gzipped and is fetched only when someone opens `/field`.
- One palette, two renderers: `src/tokens.ts` reads the CSS custom properties
  defined in `index.css` rather than restating them.
- The entry contract is shared. `can_enter_field` and `field_blocked_reason` are
  computed **server-side**, so the 2D page and the XR module cannot disagree
  about whether an uncertain scan may launch the module.

## The trap this walked into

Naming a `manualChunks` group for three made that chunk a **static** dependency
of the entry. Vite then emitted `<link rel="modulepreload">` for 2.2 MB of
three.js in `index.html` — the landing page would have downloaded the entire XR
bundle on first paint. Nothing in the build output looked wrong; the chunk sizes
were the same either way.

Removing `manualChunks` fixed it: Rollup already isolates a dynamic-import graph
correctly, and the hand-holding was what broke it.

Separately, the `@react-three/xr` emulator ships ~4.5 MB of synthetic room
meshes. Setting `emulate: false` stops it running but not shipping, because the
dynamic import still exists in the library — production builds stub the module.

Both failures are now asserted by `scripts/check-budget.mjs`, which runs as part
of `pnpm build` and fails it. Neither was visible by reading the build log,
which is the reason the check exists.
