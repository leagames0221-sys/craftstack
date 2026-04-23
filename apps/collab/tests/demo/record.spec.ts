import { test, expect, type Page } from "@playwright/test";

/**
 * Demo recording 窶・reproducible ~45-second walkthrough.
 *
 * Env vars (all optional):
 *   DEMO_WORKSPACE_SLUG  窶・defaults to the first workspace on the dashboard.
 *   DEMO_BOARD_SLUG      窶・defaults to the first board in that workspace.
 *   DEMO_SLOWMO_MS       窶・in playwright.demo.config.ts (default 250).
 *
 * Strategy notes:
 *   - Locators prefer aria-label (stable) over role+name (brittle when
 *     multiple links share similar accessible names inside the modal).
 *   - Modal close uses a URL mutation rather than chasing DOM elements 窶・ *     the card modal is driven by the `?card=` search param, so dropping
 *     the param is a guaranteed close.
 *   - Each optional interaction (bell, scroll) is wrapped in a soft guard
 *     so a missing element surfaces in the recording rather than aborting
 *     the whole take.
 */

test("45-second board walkthrough", async ({ page }) => {
  // Step 1: Dashboard hero.
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Boardly" }).first(),
  ).toBeVisible();
  await pause(page, 1500);

  // Step 2: Enter a workspace.
  const wsSlug = process.env.DEMO_WORKSPACE_SLUG;
  if (wsSlug) {
    await page.goto(`/w/${wsSlug}`);
  } else {
    const wsLink = page.locator('a[href^="/w/"]').first();
    await expect(wsLink).toBeVisible({ timeout: 5000 });
    await wsLink.click();
  }
  await page.waitForURL(/\/w\//);
  await pause(page, 1500);

  // Step 3: Open a board.
  const bSlug = process.env.DEMO_BOARD_SLUG;
  const boardLink = bSlug
    ? page.locator(`a[href*="/b/${bSlug}"]`).first()
    : page.locator('a[href*="/b/"]').first();
  await expect(boardLink).toBeVisible({ timeout: 5000 });
  const boardHref = await boardLink.getAttribute("href");
  await boardLink.click();
  await page.waitForURL(/\/b\//);
  await pause(page, 2000);

  const boardUrl = boardHref
    ? new URL(boardHref, page.url()).toString()
    : page.url();

  // Step 4: DnD. Drag the first card from the first list over to the
  // second list so the cross-column animation is visible.
  const card = page.locator("ol > li li").first();
  await card.waitFor({ state: "visible", timeout: 5000 });
  const secondList = page.locator("ol > li").nth(1);
  await secondList.waitFor({ state: "visible", timeout: 5000 });

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
      { steps: 20 },
    );
    await page.mouse.up();
  }
  await pause(page, 1800);

  // Step 5: Open a card modal. Re-query after the DnD because the DOM
  // may have been remounted.
  const nextCard = page.locator("ol > li li").first();
  if (await nextCard.count()) {
    await nextCard.click();
    await page.waitForURL(/\?card=/, { timeout: 5000 }).catch(() => undefined);
  }
  await pause(page, 2500);

  // Step 6: Scroll the modal content so labels / assignees / comments /
  // history slide into the viewport. We roll the mouse wheel at the top
  // right of the viewport to avoid hitting the backdrop overlay.
  await page.mouse.move(1400, 400);
  await page.mouse.wheel(0, 500);
  await pause(page, 1400);
  await page.mouse.wheel(0, 500);
  await pause(page, 1400);
  await page.mouse.wheel(0, 500);
  await pause(page, 1400);

  // Step 7: Close the modal by dropping the ?card= param. This sidesteps
  // the "is the Close link the backdrop or the header button?" locator
  // problem and works regardless of modal internal markup.
  await page.goto(boardUrl);
  await pause(page, 800);

  // Step 8: Open the notifications bell. Guarded 窶・if the header layout
  // changes, keep going rather than aborting.
  const bell = page.locator('[aria-label^="Notifications"]').first();
  if (await bell.count()) {
    await bell.click();
    await pause(page, 2200);
    // Dismiss the dropdown by clicking a neutral area.
    await page.mouse.click(40, 400);
  }
  await pause(page, 800);

  // Step 9: Return to the workspace and scroll through Members / Invitations
  // / Activity so those sections get a moment on screen.
  const backLink = page.locator('a[href^="/w/"]').first();
  if (await backLink.count()) {
    await backLink.click();
    await page
      .waitForURL(/\/w\/[^/]+$/, { timeout: 5000 })
      .catch(() => undefined);
  }
  await pause(page, 1500);
  await page.mouse.wheel(0, 700);
  await pause(page, 1500);
  await page.mouse.wheel(0, 700);
  await pause(page, 2000);
});

async function pause(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}
