import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Authed Playwright config — runs the credentials-setup project first to
 * produce `playwright/.auth/<role>.json` storage states, then runs the
 * authed specs with `test.use({ storageState })`.
 *
 * Gated on `E2E_ENABLED=1` and `E2E_SHARED_SECRET`. See ADR-0022 + 0038.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // shared DB; serialize to keep state predictable
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup-auth\.ts/,
    },
    {
      name: "authed",
      testMatch: /authed\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: resolve(__dirname, "playwright/.auth/owner.json"),
      },
    },
    {
      name: "authed-a11y",
      testMatch: /authed-a11y\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: resolve(__dirname, "playwright/.auth/owner.json"),
      },
    },
  ],
  // webServer is intentionally omitted — CI boots the server out-of-band
  // so the env can be set to E2E_ENABLED=1 before Next reads it.
});
