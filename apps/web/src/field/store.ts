import { createXRStore } from '@react-three/xr'

/**
 * One XR store for the module.
 *
 * Teleport only. No smooth locomotion in v1: it is the main comfort risk and
 * the row is 10 m, which is small enough not to need it (issue #37).
 *
 * The emulator is development-only. It is genuinely useful -- it is how the
 * scenes get built without putting a headset on for every change -- but it
 * carries ~4.5 MB of synthetic room meshes that have no business in a
 * production bundle.
 */
export const xrStore = createXRStore({
  hand: { teleportPointer: true },
  controller: { teleportPointer: true },
  emulate: import.meta.env.DEV ? 'metaQuest3' : false,
  // Foveation and multiview are the two settings that decide whether the
  // Infection Theatre holds 72 FPS on Quest 3 (issue #40).
  foveation: 0.6,
})
