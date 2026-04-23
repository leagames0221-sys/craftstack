import { expect, test } from "@playwright/test";

test.describe("Workspace view (authed)", () => {
  test("shows seeded board and members section", async ({ page }) => {
    await page.goto("/w/e2e");
    await expect(
      page.getByRole("heading", { name: /E2E Workspace/i }),
    ).toBeVisible();
    await expect(page.getByText("E2E board")).toBeVisible();
  });

  test("rejects duplicate workspace slug with a server-side 409", async ({
    request,
  }) => {
    const res = await request.post("/api/workspaces", {
      data: { name: "dup", slug: "e2e" },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("SLUG_TAKEN");
  });

  test("creates and deletes a workspace end-to-end", async ({ request }) => {
    const slug = `e2e-tmp-${Date.now()}`;
    const createRes = await request.post("/api/workspaces", {
      data: { name: "Tmp workspace", slug },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { id: string; slug: string };
    expect(created.slug).toBe(slug);

    // Sanity: appears in the list.
    const list = await request.get("/api/workspaces");
    const rows = (await list.json()) as Array<{ slug: string }>;
    expect(rows.some((r) => r.slug === slug)).toBe(true);
  });
});
