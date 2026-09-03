import { defineConfig, devices } from '@playwright/test'

/**
 * One happy path, not a suite. Needs the whole stack up:
 *
 *   docker compose -f infra/docker-compose.yml up -d
 *   cd services/api && alembic upgrade head && python seed.py
 *   uvicorn app.main:app --port 8000
 *   pnpm --filter crop-disease-detector dev
 *   pnpm --filter crop-disease-detector exec playwright install chromium
 *   pnpm --filter crop-disease-detector exec playwright test
 *
 * Skipped rather than failed when the API is unreachable, so running it without
 * a database does not produce a wall of red.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5199',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
