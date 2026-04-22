import { expect, test } from "@playwright/test";

test.describe("Signin page", () => {
  test("renders OAuth buttons and Boardly brand", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "Boardly" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeVisible();
  });

  test("unauthenticated /dashboard redirects to /signin", async ({ page }) => {
    const res = await page.goto("/dashboard");
    expect(res?.url()).toContain("/signin");
    expect(res?.url()).toContain("callbackUrl");
  });

  test("unauthenticated /api/workspaces returns 401 JSON", async ({
    request,
  }) => {
    const res = await request.get("/api/workspaces");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });
});
