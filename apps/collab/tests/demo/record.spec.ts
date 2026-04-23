import { test, expect, type Page } from "@playwright/test";

/**
 * Demo recording — reproducible ~90-second walk-through.
 *
 * Env vars (all optional, sensible defaults fall back to /dashboard where
 * the viewer can spot the first workspace):
 *   DEMO_WORKSPACE_SLUG  — defaults to the first workspace listed.
 *   DEMO_BOARD_SLUG      — defaults to the first board in that workspace.
 *   DEMO_SLOWMO_MS       — read in playwright.demo.config.ts (default 250).
 *
 * The script never creates or deletes rows — it only navigates and
 * interacts with whatever data the authenticated account already has. That
 * keeps the recording pure replay rather than a destructive fixture dance,
 * and makes it safe to run against the production deploy.
 *
 * The mp4 output lands at test-results-demo/<test>/video.webm, which
 * `pnpm demo:convert` muxes into scripts/demo/input.mp4 for the TTS /
 * compose pipeline.
 */

test("90-second board walkthrough", async ({ page }) => {
  // Step 1: Dashboard — show the Boardly brand and the workspaces list.
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Boardly" }).first(),
  ).toBeVisible();
  await pause(page, 1500);

  // Step 2: Open a workspace. Prefer the env-specified slug, otherwise the
  // first card link on the dashboard.
  const wsSlug = process.env.DEMO_WORKSPACE_SLUG;
  if (wsSlug) {
    await page.goto(`/w/${wsSlug}`);
  } else {
    const wsLink = page.locator('a[href^="/w/"]').first();
    await expect(wsLink).toBeVisible();
    await wsLink.click();
  }
  await pause(page, 1500);

  // Step 3: Open a board. Same env-or-first fallback.
  const bSlug = process.env.DEMO_BOARD_SLUG;
  const boardLink = bSlug
    ? page.locator(`a[href*="/b/${bSlug}"]`).first()
    : page.locator('a[href*="/b/"]').first();
  await expect(boardLink).toBeVisible();
  await boardLink.click();
  await page.waitForURL(/\/b\//);
  await pause(page, 2000);

  // Step 4: Find the first draggable card and move it to the next list.
  // We locate by the sortable attributes @dnd-kit places on the LI.
  const firstCard = page
    .locator('li[role="button"], li[aria-roledescription]')
    .first();
  const fallbackCard = page.locator("ol li li").first(); // nested <li> = card inside list
  const card = (await firstCard.count()) > 0 ? firstCard : fallbackCard;
  await expect(card).toBeVisible();

  const secondList = page.locator("ol > li").nth(1);
  await expect(secondList).toBeVisible();

  const cardBox = await card.boundingBox();
  const destBox = await secondList.boundingBox();
  if (cardBox && destBox) {
    await page.mouse.move(
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      destBox.x + destBox.width / 2,
      destBox.y + destBox.height / 2,
      { steps: 18 },
    );
    await page.mouse.up();
  }
  await pause(page, 1500);

  // Step 5: Open the first remaining card to show the modal (labels,
  // assignees, comments, history).
  await page.locator("ol li li").first().click();
  await pause(page, 2500);

  // Step 6: Scroll the modal to surface the labels / comments / activity
  // sections so the video captures them without any user input.
  await page.mouse.wheel(0, 400);
  await pause(page, 1500);
  await page.mouse.wheel(0, 400);
  await pause(page, 1500);

  // Step 7: Close the modal and open the notifications bell.
  await page.keyboard.press("Escape").catch(() => undefined);
  // The Escape shortcut isn't wired to the modal yet; clicking the close
  // link is the reliable path.
  const closeLink = page.getByRole("link", { name: /^close$/i }).first();
  if (await closeLink.count()) await closeLink.click();
  await pause(page, 800);

  const bell = page.getByRole("button", { name: /notifications/i }).first();
  if (await bell.count()) {
    await bell.click();
    await pause(page, 2000);
    // Close the dropdown by clicking the page body.
    await page.mouse.click(20, 20);
  }
  await pause(page, 500);

  // Step 8: Back to the workspace page to scroll through Members,
  // Invitations, Activity sections — the rest of the Boardly story.
  await page.goBack();
  await pause(page, 1000);
  await page.mouse.wheel(0, 600);
  await pause(page, 1500);
  await page.mouse.wheel(0, 600);
  await pause(page, 2000);
});

async function pause(page: Page, ms: number) {
  // Prefer the page's clock so slowMo doesn't accidentally stretch it.
  await page.waitForTimeout(ms);
}
