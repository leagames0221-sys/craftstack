import { defineConfig, devices } from "@playwright/test";

/**
 * Knowlex Playwright configuration.
 *
 * Two modes, selected by env:
 *
 * 1. `E2E_BASE_URL` set (CI / recruiter-facing smoke) — tests run
 *    directly against the live Knowlex deployment. No dev server is
 *    spun up. This is the primary use: validating that
 *    https://craftstack-knowledge.vercel.app/ and its kb APIs are
 *    healthy after every deploy.
 *
 * 2. `E2E_BASE_URL` unset (local) — spins up `pnpm dev` on port 3001
 *    and runs the same suite against it. Requires a live
 *    GEMINI_API_KEY and a reachable DB (docker-compose) for the
 *    ingest/ask paths to work, but the /api/kb/stats smoke needs
 *    neither and is safe to run without them.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3001",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
