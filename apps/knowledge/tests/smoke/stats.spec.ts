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

  test("GET /api/attestation returns structurally complete payload (ADR-0056)", async ({
    request,
  }) => {
    // The attestation endpoint is the single-curl audit artefact:
    // tag + commit + buildAt + adrCount + lastEvalRun + scope.deferred
    // + honestScopeNotes + runtime corpus + runtime schema drift +
    // measurements.daysSinceLastGreenRun + cronHealthHint, all in one
    // response. This smoke probe asserts the contract surface that
    // a senior reviewer's curl would exercise; deeper validation of
    // build-time invariants is in attestation-data.test.ts.
    const res = await request.get("/api/attestation");
    expect(res.status(), `attestation expected 200, got ${res.status()}`).toBe(
      200,
    );
    const body = await res.json();
    expect(typeof body.tag).toBe("string");
    expect(typeof body.commit).toBe("string");
    expect(typeof body.buildAt).toBe("string");
    expect(typeof body.claims.adrCount).toBe("number");
    expect(body.runtime.schema.drift).toBe(false);
    expect(body.runtime.corpus.indexType).toBe("hnsw");
    expect(body.runtime.corpus.expectedDim).toBe(768);
    expect(Array.isArray(body.scope.deferred)).toBe(true);
    expect(body.scope.honestScopeNotes.join("\n")).toMatch(/T-06/);
    // cronHealthHint is one of the three string forms; just assert it's
    // non-empty so a reviewer always sees the staleness assessment.
    expect(typeof body.measurements.cronHealthHint).toBe("string");
    expect(body.measurements.cronHealthHint.length).toBeGreaterThan(0);
  });

  test("GET /api/health/schema returns drift=false (ADR-0053 runtime canary)", async ({
    request,
  }) => {
    // Closes the runtime side of ADR-0051: a Vercel deploy that lags
    // behind the migrations on `main` will exhibit `drift=true` here
    // with the missing column named explicitly. The 6-hourly smoke
    // cron surfaces the gap within hours; the eval cron's nightly
    // run also catches it but ~12-18h later. Recorded in ADR-0053.
    const res = await request.get("/api/health/schema");
    const body = await res.json();
    expect(
      res.status(),
      `schema canary expected 200, got ${res.status()}; payload: ${JSON.stringify(body, null, 2)}`,
    ).toBe(200);
    expect(body.drift).toBe(false);
    // Each declared model must report drift=false individually, so a
    // mixed result (one drifting table, others fine) cannot pass an
    // aggregate check that happens to be false.
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThan(0);
    for (const check of body.checks) {
      expect(check.drift, `${check.table}.drift`).toBe(false);
      expect(check.missing, `${check.table}.missing`).toEqual([]);
    }
  });
});
