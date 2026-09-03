import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 8000 is a popular default and is often already taken on a dev machine.
const API_URL = process.env.API_URL ?? 'http://localhost:8000'

/**
 * The @react-three/xr emulator is development tooling: it is how the XR scene
 * gets built without putting a headset on for every change. It carries ~4.5 MB
 * of synthetic room meshes.
 *
 * Setting `emulate: false` on the store stops it RUNNING in production, but the
 * dynamic import still exists inside the library, so Rollup emits every room
 * chunk into dist anyway. Stubbing the module is what actually removes them.
 * scripts/check-budget.mjs fails the build if they come back.
 */
function stripXrEmulator() {
  return {
    name: 'strip-xr-emulator',
    apply: 'build',
    // Must run before vite:resolve, which would otherwise resolve the relative
    // import to a real path before this plugin ever sees it.
    enforce: 'pre',
    resolveId(source, importer) {
      const fromXr = importer?.includes('@pmndrs/xr') ?? false
      return fromXr && source.includes('emulate') ? '\0xr-emulator-stub' : null
    },
    load(id) {
      return id === '\0xr-emulator-stub' ? 'export function emulate() {}' : null
    },
  }
}

export default defineConfig({
  plugins: [react(), stripXrEmulator()],
  build: {
    // The /field route is a dynamic import, so Rollup isolates three.js and the
    // XR stack into their own chunk. Do NOT add manualChunks here: naming a
    // chunk for three makes it a static dependency of the entry, and Vite then
    // emits a modulepreload for it in index.html -- the landing page starts
    // downloading 2 MB of three.js on first paint. scripts/check-budget.mjs
    // fails the build if that comes back.
    chunkSizeWarningLimit: 1400,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.js'],
  },
  server: {
    proxy: { '/api': API_URL, '/healthz': API_URL },
  },
})
