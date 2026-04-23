import { expect, test } from "@playwright/test";

/**
 * Knowlex demo recording — drives the Ask → citations → stats →
 * /docs/api flow on a timeline that matches the cues in
 * `scripts/demo-knowlex/narration.json`. Target runtime ~33 s.
 *
 * Timing contract (both sides must agree):
 *
 *   0.0  s  : /kb loads, heading visible
 *   0.8  s  : narration line 1 "Knowlex は RAG アプリ..."  (ends ~4 s)
 *   3-6  s  : fill title + content (slowMo 250ms makes this visible)
 *   6.0  s  : narration line 2 "貼った文を 512 文字で..."  (ends ~12 s)
 *   6-12 s  : click Ingest, server replies, chunks appear
 *   12-14 s : navigate to /, fill question
 *   14.0 s  : narration line 3 "HNSW で kNN..."            (ends ~19 s)
 *   14-20 s : Ask click + Gemini streams the answer with citations
 *   20-22 s : navigate to /api/kb/stats, JSON renders
 *   21.5 s  : narration line 4 "stats エンドポイント..."    (ends ~25.5 s)
 *   22-27 s : dwell on the stats JSON
 *   27-28 s : navigate to /docs/api
 *   27.5 s  : narration line 5 "OpenAPI 手書き..."          (ends ~31.5 s)
 *   28-33 s : scroll /docs/api slowly
 *
 * If you change any `waitForTimeout` below, re-check the narration
 * `at` values in `scripts/demo-knowlex/narration.json` and re-run
 * `pnpm demo:knowlex:tts && pnpm demo:knowlex:compose`.
 *
 * Runs against the live Vercel deploy by default; override with
 * `DEMO_BASE_URL=http://localhost:3001`.
 */

const DEMO_DOC = {
  title: `demo-walkthrough-${Date.now()}`,
  content: [
    "Knowlex chunks pasted text into paragraph-aware 512-character windows,",
    "embeds each chunk with gemini-embedding-001 at 768 dimensions via the",
    "outputDimensionality provider option, and stores the vectors in a",
    "pgvector column behind an HNSW cosine-distance index. Retrieval uses",
    "cosine kNN over that index; the top-K chunks are handed to Gemini 2.0",
    "Flash, which streams a grounded answer with numbered citations.",
  ].join(" "),
};

const DEMO_QUESTION = "What embedding model does Knowlex use?";

test("knowlex walkthrough", async ({ page }) => {
  // ---- 0.0-6.0 s : land on /kb, start filling the ingest form ----
  await page.goto("/kb");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Line 1 ("KnowlexはRAG...") plays over this idle dwell.
  await page.waitForTimeout(2500);

  const titleField = page.getByLabel(/title/i);
  const contentField = page.getByLabel(/content|body|text/i).first();
  if (await titleField.isVisible().catch(() => false)) {
    await titleField.fill(DEMO_DOC.title);
  }
  if (await contentField.isVisible().catch(() => false)) {
    await contentField.fill(DEMO_DOC.content);
  }

  // ---- 6.0-12.0 s : click Ingest, let line 2 ("チャンク化...") play ----
  const ingestBtn = page
    .getByRole("button", { name: /ingest|add|save/i })
    .first();
  if (await ingestBtn.isVisible().catch(() => false)) {
    await ingestBtn.click();
  }
  // Full 6-second dwell so line 2 (6.0 s, ~6 s duration) ends cleanly
  // before we jump pages. Also gives the Neon insert + Gemini embed
  // round-trip plenty of time to finish before the next narration cue.
  await page.waitForTimeout(6000);

  // ---- 12.0-14.0 s : switch to / and compose the question ----
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const questionField = page.getByRole("textbox").first();
  await questionField.fill(DEMO_QUESTION);

  // ---- 14.0-20.0 s : Ask + streaming, line 3 ("HNSW...") plays ----
  await page.getByRole("button", { name: /^ask$/i }).click();
  await page.waitForTimeout(6000);

  // ---- 20.0-27.0 s : /api/kb/stats, line 4 plays at 21.5 s ----
  await page.goto("/api/kb/stats");
  await page.waitForTimeout(7000);

  // ---- 27.0-33.0 s : /docs/api, line 5 plays at 27.5 s ----
  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(2000);
});
