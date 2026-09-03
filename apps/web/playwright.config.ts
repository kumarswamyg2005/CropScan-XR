import { defineConfig, devices } from '@playwright/test'

/**
 * One happy path, not a suite. It needs the whole stack up:
 *
 *   docker compose -f infra/docker-compose.yml up -d
 *   alembic upgrade head && python services/api/seed.py
 *   uvicorn app.main:app --port 8000
 *   pnpm --filter web dev
 *   pnpm --filter web exec playwright install chromium
 *   pnpm --filter web exec playwright test
 *
 * It is skipped rather than failed when the API is not reachable, so a
 * developer running `pnpm test` without a database does not get a red wall.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
