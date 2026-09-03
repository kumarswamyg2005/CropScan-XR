/**
 * Bundle budget check. Run after `vite build`.
 *
 * Two rules from the PRD, both easy to break by accident and invisible until
 * someone opens the site on a phone:
 *   1. initial JS under 180 KB gzipped
 *   2. the landing page must not download three.js
 *
 * Rule 2 has already been broken once here: a manualChunks config pulled three
 * into a named chunk, which made it a static dependency of the entry, and Vite
 * emitted a <link rel="modulepreload"> for 2.2 MB of it in index.html. Nothing
 * in the build output looked wrong. Hence this check.
 */

import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const ASSETS = join(DIST, 'assets')
const BUDGET_GZIP = 180 * 1024

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const failures = []

// --- 1. initial JS -----------------------------------------------------------
const entryMatch = html.match(/<script type="module"[^>]*src="\/assets\/([^"]+)"/)
if (!entryMatch) {
  failures.push('could not find the entry script in index.html')
} else {
  const entry = readFileSync(join(ASSETS, entryMatch[1]))
  const gzipped = gzipSync(entry).length
  const label = `${(gzipped / 1024).toFixed(1)} KB gzipped`
  if (gzipped > BUDGET_GZIP) {
    failures.push(`initial JS is ${label}, over the 180 KB budget`)
  } else {
    console.log(`ok  initial JS ${label} (budget 180 KB)`)
  }

  // --- 2. three.js must not be reachable on first paint ----------------------
  const text = entry.toString('utf8')
  if (text.includes('WebGLRenderer') || text.includes('BufferGeometry')) {
    failures.push('three.js is inside the entry chunk')
  } else {
    console.log('ok  three.js is not in the entry chunk')
  }
}

const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="\/assets\/([^"]+)"/g)]
for (const [, file] of preloads) {
  const content = readFileSync(join(ASSETS, file), 'utf8')
  if (content.includes('WebGLRenderer')) {
    failures.push(`index.html preloads ${file}, which contains three.js`)
  }
}
console.log(`ok  ${preloads.length} modulepreload link(s), none containing three.js`)

// --- 3. no dev-only fixtures in a production build ---------------------------
const rooms = readdirSync(ASSETS).filter((f) => /_room-|office_|emulate-/.test(f))
if (rooms.length > 0) {
  failures.push(`XR emulator fixtures shipped in the production build: ${rooms.join(', ')}`)
} else {
  console.log('ok  no XR emulator fixtures in the build')
}

// --- 4. every design token must survive into the built CSS -------------------
// The XR scene reads these custom properties at runtime. Tailwind's @theme
// tree-shakes variables it cannot see used in CSS, and the tissue-ramp colours
// are only referenced from TypeScript -- they were silently dropped once, and
// the 3D ground rendered black. One palette, two renderers, or neither.
const TOKENS = [
  'ground', 'sheet', 'ink', 'ink-soft', 'rule',
  'chlorophyll', 'chlorosis', 'necrosis', 'sporulation',
]
const cssFile = readdirSync(ASSETS).find((f) => f.endsWith('.css'))
if (!cssFile) {
  failures.push('no stylesheet in the build')
} else {
  const css = readFileSync(join(ASSETS, cssFile), 'utf8')
  const missing = TOKENS.filter((t) => !css.includes(`--color-${t}:`))
  if (missing.length > 0) {
    failures.push(`design tokens missing from the built CSS: ${missing.join(', ')}`)
  } else {
    console.log(`ok  all ${TOKENS.length} design tokens present in the built CSS`)
  }
}

// --- 5. the XR chunk itself, for reference -----------------------------------
const xrChunk = readdirSync(ASSETS).find((f) => f.startsWith('FieldPage-'))
if (xrChunk) {
  const size = gzipSync(readFileSync(join(ASSETS, xrChunk))).length
  console.log(`ok  XR chunk ${(size / 1024).toFixed(1)} KB gzipped, loaded only on /field`)
}

if (failures.length > 0) {
  console.error('\nBUDGET FAILED')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log('\nbudget ok')
