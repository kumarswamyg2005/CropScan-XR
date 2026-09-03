import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The @react-three/xr emulator is development tooling: it is how the XR scenes
 * get built without putting a headset on for every change. It carries ~4.5 MB
 * of synthetic room meshes.
 *
 * Setting `emulate: false` on the store stops it RUNNING in production, but the
 * dynamic import still exists inside the library, so Rollup emits every room
 * chunk into dist anyway -- dead weight on every deploy. Stubbing the module in
 * production builds is what actually removes them. scripts/check-budget.mjs
 * fails the build if they come back.
 */
function stripXrEmulator(): Plugin {
  return {
    name: 'strip-xr-emulator',
    apply: 'build',
    // Must run before vite:resolve, which would otherwise resolve the
    // relative import to a real path before this plugin ever sees it.
    enforce: 'pre',
    resolveId(source, importer) {
      // The import inside the package is relative ('./emulate.js'), so match on
      // the importer too rather than on a bare specifier.
      const fromXr = importer?.includes('@pmndrs/xr') ?? false
      const isEmulator = source.includes('emulate')
      return fromXr && isEmulator ? '\0xr-emulator-stub' : null
    },
    load(id) {
      return id === '\0xr-emulator-stub' ? 'export function emulate() {}' : null
    },
  }
}

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss(), stripXrEmulator()],
  build: {
    // No manualChunks. Rollup already isolates the dynamic-import graph behind
    // the lazy /field route, and forcing three into a named chunk made that
    // chunk a static dependency of the entry -- Vite then emitted a
    // <link rel="modulepreload"> for it in index.html and the landing page
    // started fetching 2.2 MB of three.js.
    chunkSizeWarningLimit: 1400,
  },
  server: {
    // Port is configurable because 8000 is a popular default and is often
    // already taken by something else on a dev machine.
    proxy: {
      '/api': API_URL,
      '/healthz': API_URL,
    },
  },
})
