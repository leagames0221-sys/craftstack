import { expect, test } from "@playwright/test";

test.describe("Rate limits (authed)", () => {
  test("/api/notifications serves 200 within cap", async ({ request }) => {
    const res = await request.get("/api/notifications?limit=5");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; unread: number };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.unread).toBe("number");
  });

  test("/api/search returns the member's workspaces on empty q", async ({
    request,
  }) => {
    const res = await request.get("/api/search?q=");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      workspaces: Array<{ slug: string }>;
    };
    expect(body.workspaces.some((w) => w.slug === "e2e")).toBe(true);
  });

  test("/api/search eventually trips the per-user limit under a tight burst", async ({
    request,
  }) => {
    // Cap is 60/60s; burst 80 sequentially and expect at least one 429.
    let sawRateLimit = false;
    for (let i = 0; i < 80; i++) {
      const r = await request.get(`/api/search?q=burst${i}`);
      if (r.status() === 429) {
        sawRateLimit = true;
        const body = (await r.json()) as { code: string };
        expect(body.code).toBe("SEARCH_RATE_LIMITED");
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
  });
});
