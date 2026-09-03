import { expect, test } from '@playwright/test'

/**
 * The point of this test is the LAST step. Anyone can assert that an upload
 * produces a diagnosis; what this product claims is that the diagnosis ends up
 * in a chain you can verify. So the assertion that matters is that the ledger
 * grew and still verifies.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:8000'

test('the field module runs the cycle and stalls it on one condition', async ({ page }) => {
  await page.goto('/field?disease=Apple___Apple_scab')
  await page.waitForSelector('canvas', { timeout: 30_000 })

  // Starts at the pathogen optimum, so the cycle completes.
  await expect(page.getByText(/The cycle completed/)).toBeVisible()

  // Drop leaf wetness below Venturia inaequalis's nine hours.
  await page.locator('input[type=range]').nth(1).fill('2')

  await expect(page.getByText(/Stopped at Germination/)).toBeVisible()
  await expect(page.getByText(/below the 9 h this stage needs/)).toBeVisible()
  // Later stages must read "not reached", not "failed".
  await expect(page.getByText('not reached').first()).toBeVisible()
})

test('a scan becomes a verifiable record', async ({ page, request }) => {
  const health = await request.get(`${API}/healthz`).catch(() => null)
  test.skip(!health?.ok(), 'API is not running; start the stack first')
  test.skip(!(await health.json()).model_loaded, 'no model exported; run ml/export.py first')

  const before = await (await request.get(`${API}/api/ledger/stats`)).json()

  await page.goto('/detect')
  await page.setInputFiles('input[type="file"]', {
    name: 'leaf.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(process.env.E2E_LEAF_B64 ?? '', 'base64'),
  })
  await page.getByRole('button', { name: /detect|analyse|analyze/i }).click()

  await expect(page.getByText(/confidence/i).first()).toBeVisible({ timeout: 30_000 })

  const after = await (await request.get(`${API}/api/ledger/stats`)).json()
  expect(after.entries).toBeGreaterThan(before.entries)

  const verify = await (await request.get(`${API}/api/ledger/verify`)).json()
  expect(verify.ok).toBe(true)
  expect(verify.first_break).toBeNull()
})
