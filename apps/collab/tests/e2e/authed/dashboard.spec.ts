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
    await expect(dialog.getByText("E2E Workspace")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("shortcuts help opens on '?'", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("?");
    await expect(
      page.getByRole("dialog", { name: /Keyboard shortcuts/i }),
    ).toBeVisible();
  });

  test("notifications bell renders even with zero unread", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByLabel(/^Notifications/i)).toBeVisible();
  });
});
