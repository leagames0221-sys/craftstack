import { expect, test } from "@playwright/test";

/**
 * Unauthenticated smoke coverage.
 *
 * These scenarios exercise the app boundaries that don't require an OAuth
 * session: public routes, API auth gating, security headers, and the
 * invitation accept-page path (which must render standalone so an
 * invited-but-not-signed-in user can see the sign-in CTA).
 *
 * Full authenticated flows require a seeded DB + OAuth stub and are
 * intentionally out of scope for the portfolio smoke layer.
 */

test.describe("Public pages", () => {
  test("invite landing renders a sign-in CTA when signed out", async ({
    page,
  }) => {
    await page.goto("/invite/deadbeef-placeholder-token");
    await expect(
      page.getByRole("heading", { name: /invited to boardly/i }),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: /sign in to accept/i });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toContain("/signin");
    expect(href).toContain("callbackUrl");
    expect(href).toContain(encodeURIComponent("/invite/"));
  });

  test("nonexistent private page bounces to signin", async ({ page }) => {
    // Proxy protects every page under / except /signin and /invite, so an
    // unauthenticated request to a bogus path must terminate on /signin
    // (after following the 307). The crucial property is: no crash, no
    // leak of whether the path exists.
    await page.goto("/this-does-not-exist");
    await expect(page).toHaveURL(/\/signin/);
  });
});

test.describe("API auth gate", () => {
  // Any endpoint protected by auth() must return 401 + JSON body to an
  // unauthenticated client rather than a 307 HTML redirect. That promise is
  // load-bearing for our client fetch code.
  for (const { method, path } of [
    { method: "GET" as const, path: "/api/notifications" },
    { method: "GET" as const, path: "/api/workspaces" },
    { method: "POST" as const, path: "/api/notifications/read" },
  ]) {
    test(`${method} ${path} -> 401 JSON`, async ({ request }) => {
      const res =
        method === "GET" ? await request.get(path) : await request.post(path);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("UNAUTHORIZED");
    });
  }

  test("POST /api/invitations/accept with empty body -> 401 (auth first)", async ({
    request,
  }) => {
    // Ordering matters: we must reject unauthenticated callers *before*
    // validating body shape so body-validation errors can't leak whether a
    // route exists or consumes a particular shape.
    const res = await request.post("/api/invitations/accept", {
      data: {},
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Security headers", () => {
  test("/signin carries HSTS, X-Frame-Options, Referrer-Policy", async ({
    request,
  }) => {
    const res = await request.get("/signin");
    const headers = res.headers();
    // Case-insensitive lookup.
    const get = (k: string) =>
      headers[k] ?? headers[k.toLowerCase()] ?? headers[k.toUpperCase()];
    expect(get("strict-transport-security") ?? "").toMatch(/max-age=/i);
    expect(get("x-frame-options") ?? "").toMatch(/deny/i);
    expect(get("referrer-policy") ?? "").toMatch(/./);
  });
});

test.describe("Health", () => {
  test("GET /api/health returns 200 OK", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
  });
});
