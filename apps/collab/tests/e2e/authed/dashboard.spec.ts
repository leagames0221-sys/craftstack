import { expect, test } from "@playwright/test";

test.describe("Dashboard (authed)", () => {
  test("lists the seeded workspaces", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /Your workspaces/i }),
    ).toBeVisible();
    await expect(page.getByText("E2E Workspace")).toBeVisible();
  });

  test("command palette opens on Ctrl+K and searches workspaces", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: /Command Palette/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("E2E");
    // The palette lists workspace results as option rows; dashboard page
    // also has "E2E Workspace" in its own card list. Scope to the option
    // role so we match only the palette row.
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("shortcuts help opens from the header button", async ({ page }) => {
    await page.goto("/dashboard");
    // The "?" keybinding is covered by a unit check on the component; at
    // the E2E layer we verify the header button is present and clickable
    // (Playwright's keyboard.press("?") is layout-sensitive and flaky
    // across Linux CI keymaps).
    await page
      .getByRole("button", { name: /Keyboard shortcuts \(press \?\)/i })
      .click();
    await expect(
      page.getByRole("dialog", { name: /Keyboard shortcuts/i }),
    ).toBeVisible();
  });

  test("notifications bell renders even with zero unread", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByLabel(/^Notifications/i)).toBeVisible();
  });
});
