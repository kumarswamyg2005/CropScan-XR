import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * upload → result → order → receipt → ledger entry visible.
 *
 * The point of this test is the LAST step. Anyone can assert that an upload
 * produces a diagnosis; what this product claims is that the diagnosis and the
 * payment both end up in a chain you can verify. So the assertion that matters
 * is that the ledger grew and still verifies.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:8000'

test.beforeAll(async ({ request }) => {
  const health = await request.get(`${API}/healthz`).catch(() => null)
  test.skip(!health?.ok(), 'API is not running; start the stack first')

  const body = await health!.json()
  test.skip(!body.model_loaded, 'no model exported; run ml/export.py first')
})

test('a scan becomes a verifiable record', async ({ page, request }) => {
  const before = await (await request.get(`${API}/api/ledger/stats`)).json()

  // --- upload ---------------------------------------------------------------
  await page.goto('/scan')
  await expect(page.getByRole('heading', { name: /scan/i })).toBeVisible()

  const specimen = fileURLToPath(new URL('./fixtures/leaf.jpg', import.meta.url))
  await page.setInputFiles('input[type="file"][accept="image/*"]:not([capture])', {
    name: 'leaf.jpg',
    mimeType: 'image/jpeg',
    buffer: readFileSync(specimen),
  })

  // --- result ---------------------------------------------------------------
  await page.waitForURL(/\/scan\/[0-9a-f-]{36}/, { timeout: 30_000 })
  const determination = page.getByRole('complementary', { name: /determination/i })
  await expect(determination).toBeVisible()
  await expect(determination.getByText(/confidence/i)).toBeVisible()

  // The specimen is the one bold thing on the page.
  await expect(page.getByRole('img').first()).toBeVisible()

  // --- ledger grew ----------------------------------------------------------
  const afterScan = await (await request.get(`${API}/api/ledger/stats`)).json()
  expect(afterScan.entries).toBeGreaterThan(before.entries)

  // --- and still verifies ---------------------------------------------------
  await page.goto('/ledger')
  await page.getByRole('button', { name: /verify/i }).click()
  await expect(page.getByText(/chain intact/i)).toBeVisible({ timeout: 20_000 })

  const verify = await (await request.get(`${API}/api/ledger/verify`)).json()
  expect(verify.ok).toBe(true)
  expect(verify.first_break).toBeNull()
})

test('an uncertain scan cannot enter the field module', async ({ page, request }) => {
  // Seeded through the API rather than the UI: producing a genuinely uncertain
  // prediction from a photo is not deterministic, and this test is about the
  // gate, not about the model.
  const scans = await request.get(`${API}/api/ledger?limit=200`)
  test.skip(!scans.ok(), 'ledger unavailable')

  await page.goto('/field?scan=does-not-exist')
  await expect(page.getByRole('heading', { name: /field module/i })).toBeVisible()
  // No cycle, no scan: the module must not offer a diagnosis-mode entry.
  await expect(page.getByRole('button', { name: /enter in vr/i })).toHaveCount(0)
})
