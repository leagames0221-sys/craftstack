import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the *demo recording* pipeline.
 *
 * This is separate from `playwright.config.ts` (which runs the smoke tests)
 * because recording wants:
 *   - A fixed 1920x1080 viewport so GIF / mp4 crops are predictable.
 *   - `video: 'on'` to capture a webm per test.
 *   - `headed` mode (so the one-time auth setup can prompt the user to sign
 *     in interactively). The record phase can still run headed — cleaner
 *     visuals than the headless Chromium cursor.
 *   - A slowMo delay so the cursor is visible to viewers. Without it,
 *     drag/drop and click animations blur together.
 *   - An explicit `testDir` pointing at tests/demo so smoke tests don't
 *     accidentally run here.
 *
 * Usage:
 *   1. One-time: `pnpm --filter collab demo:auth`
 *      -> opens a browser, user signs in with GitHub, auth state is saved.
 *   2. Reproducible: `pnpm --filter collab demo:record`
 *      -> replays the auth state and captures the demo flow.
 */
export default defineConfig({
  testDir: "./tests/demo",
  fullyParallel: false, // Recording is inherently serial (one video at a time).
  workers: 1,
  retries: 0, // Let failures surface loudly during recording.
  reporter: [["list"]],
  timeout: 10 * 60 * 1000, // Auth setup can wait up to 10 minutes for the user.
  use: {
    baseURL:
      process.env.DEMO_BASE_URL ?? "https://craftstack-collab.vercel.app",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    video: {
      mode: "on",
      size: { width: 1920, height: 1080 },
    },
    trace: "off",
    screenshot: "off",
    // slowMo is applied at the browserType level via launchOptions.
    launchOptions: {
      slowMo: Number(process.env.DEMO_SLOWMO_MS ?? 250),
    },
    headless: false,
  },
  projects: [
    {
      name: "setup",
      testMatch: "auth.setup.ts",
    },
    {
      name: "record",
      testMatch: "record.spec.ts",
      dependencies: ["setup"],
      use: {
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
  outputDir: "test-results-demo",
});
