import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the Knowlex *demo recording* pipeline.
 *
 * Separate from `playwright.config.ts` (smoke suite) for the same
 * reasons as apps/collab/playwright.demo.config.ts:
 *   - Fixed 1920×1080 viewport so the mp4 crop is predictable.
 *   - `video: 'on'` to capture a webm per test.
 *   - Headed + `slowMo` so the cursor is visible in the final video.
 *
 * Knowlex has no auth gate, so there is no `setup` project — the
 * record spec runs directly against the live deploy. Defaults to the
 * production URL; override with `DEMO_BASE_URL` for local dev.
 *
 * Usage:
 *   pnpm --filter knowledge demo:record
 *   DEMO_BASE_URL=http://localhost:3001 pnpm --filter knowledge demo:record
 */
export default defineConfig({
  testDir: "./tests/demo",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 5 * 60 * 1000,
  use: {
    baseURL:
      process.env.DEMO_BASE_URL ?? "https://craftstack-knowledge.vercel.app",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    video: {
      mode: "on",
      size: { width: 1920, height: 1080 },
    },
    trace: "off",
    screenshot: "off",
    launchOptions: {
      slowMo: Number(process.env.DEMO_SLOWMO_MS ?? 250),
    },
    headless: false,
  },
  projects: [
    {
      name: "record",
      testMatch: "record.spec.ts",
    },
  ],
  outputDir: "test-results-demo",
});
