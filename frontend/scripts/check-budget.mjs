/**
 * Bundle budget check. Runs as part of `pnpm build`.
 *
 * Two rules, both easy to break by accident and invisible in the build log:
 *   1. initial JS under 180 KB gzipped
 *   2. the landing page must not download three.js
 *
 * Rule 2 has been broken here once already: a manualChunks config pulled three
 * into a named chunk, which made it a static dependency of the entry, and Vite
 * emitted a <link rel="modulepreload"> for 2.2 MB of it in index.html. The chunk
 * sizes looked identical either way. Hence this check.
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

// --- 1 and 2: the entry ------------------------------------------------------
const entryMatch = html.match(/<script type="module"[^>]*src="\/assets\/([^"]+)"/)
if (!entryMatch) {
  failures.push('could not find the entry script in index.html')
} else {
  const entry = readFileSync(join(ASSETS, entryMatch[1]))
  const gzipped = gzipSync(entry).length
  const label = `${(gzipped / 1024).toFixed(1)} KB gzipped`
  if (gzipped > BUDGET_GZIP) failures.push(`initial JS is ${label}, over the 180 KB budget`)
  else console.log(`ok  initial JS ${label} (budget 180 KB)`)

  const text = entry.toString('utf8')
  if (text.includes('WebGLRenderer') || text.includes('BufferGeometry')) {
    failures.push('three.js is inside the entry chunk')
  } else {
    console.log('ok  three.js is not in the entry chunk')
  }
}

const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="\/assets\/([^"]+)"/g)]
for (const [, file] of preloads) {
  if (readFileSync(join(ASSETS, file), 'utf8').includes('WebGLRenderer')) {
    failures.push(`index.html preloads ${file}, which contains three.js`)
  }
}
console.log(`ok  ${preloads.length} modulepreload link(s), none containing three.js`)

// --- 3: no dev-only fixtures in a production build ---------------------------
const fixtures = readdirSync(ASSETS).filter((f) => /_room-|office_|emulate-/.test(f))
if (fixtures.length > 0) {
  failures.push(`XR emulator fixtures shipped in the production build: ${fixtures.join(', ')}`)
} else {
  console.log('ok  no XR emulator fixtures in the build')
}

// --- 4: the lazy chunks, for reference ---------------------------------------
for (const name of ['FieldScene', 'hls']) {
  const file = readdirSync(ASSETS).find((f) => f.startsWith(`${name}-`))
  if (file) {
    const size = gzipSync(readFileSync(join(ASSETS, file))).length
    console.log(`ok  ${name} chunk ${(size / 1024).toFixed(1)} KB gzipped, loaded on demand`)
  }
}

if (failures.length > 0) {
  console.error('\nBUDGET FAILED')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\nbudget ok')
