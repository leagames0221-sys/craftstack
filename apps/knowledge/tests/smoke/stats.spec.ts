import { expect, test } from "@playwright/test";

/**
 * Knowlex production smoke — runs against whatever `baseURL` resolves
 * to (live Vercel deploy in CI, local dev server otherwise).
 *
 * These tests must stay *cheap*: no ingestion, no Gemini calls, no
 * authenticated flows. The goal is to catch broken deploys within
 * seconds of a push, not to cover the full RAG pipeline (that's what
 * `retrieve.integration.test.ts` is for).
 */

test.describe("knowlex smoke", () => {
  test("GET / renders the Ask UI", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status(), "homepage responded 200").toBe(200);
    // Heading text comes from src/app/page.tsx; matching the first few
    // stable words is enough to catch a bad deploy.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /^ask$/i })).toBeVisible();
  });

  test("GET /kb renders the Corpus UI", async ({ page }) => {
    const res = await page.goto("/kb");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("GET /api/kb/stats returns a well-shaped payload", async ({
    request,
  }) => {
    const res = await request.get("/api/kb/stats");
    expect(res.status(), "/api/kb/stats responded 200").toBe(200);
    const body = await res.json();

    // Counts are non-negative integers.
    for (const key of [
      "documents",
      "chunks",
      "embeddings",
      "orphanEmbeddings",
    ] as const) {
      expect(typeof body[key]).toBe("number");
      expect(Number.isInteger(body[key])).toBe(true);
      expect(body[key]).toBeGreaterThanOrEqual(0);
    }

    // FK integrity: should never be non-zero in a healthy deploy.
    expect(body.orphanEmbeddings).toBe(0);

    // Dim contract: either no rows yet (null) or matches the
    // configured embedder dim (768).
    if (body.storedDim !== null) {
      expect(body.storedDim).toBe(body.expectedDim);
    }
    expect(body.expectedDim).toBe(768);

    // Index type must be HNSW per ADR-0041. An accidental downgrade to
    // ivfflat would silently reintroduce the 0-chunks regression.
    expect(body.indexType).toBe("hnsw");

    // Embedder identity is stable until a migration.
    expect(body.embeddingModel).toBe("gemini-embedding-001");
  });
});
