import { test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const AUTH_FILE = "playwright/.auth/user.json";

/**
 * One-time interactive auth capture.
 *
 * Opens a real browser, navigates to /signin, and waits up to 5 minutes for
 * the user to complete OAuth (GitHub). The resulting cookies are saved to
 * `playwright/.auth/user.json` so `record.spec.ts` can replay the signed-in
 * state without any further user interaction.
 *
 * Re-run whenever your OAuth cookies expire (by default NextAuth sessions
 * live for 30 days) or when you want to record as a different user.
 */
setup("authenticate via OAuth", async ({ page }) => {
  await mkdir(dirname(AUTH_FILE), { recursive: true });

  console.log("\n================================================");
  console.log("  👤  Please sign in manually in the open browser.");
  console.log("     Recommended: Continue with GitHub.");
  console.log("     Waiting up to 5 minutes for /dashboard to load.");
  console.log("================================================\n");

  await page.goto("/signin");
  // User completes OAuth in the open window. We detect success by watching
  // for the dashboard URL.
  await page.waitForURL(/\/dashboard(\/|$|\?)/, {
    timeout: 5 * 60 * 1000,
  });

  await page.context().storageState({ path: AUTH_FILE });
  console.log(`\n   ✅ Saved auth state to ${AUTH_FILE}\n`);
});
