import { expect, test } from "@playwright/test";

/**
 * Knowlex demo recording — drives the Ask → citations → stats →
 * /docs/api flow on a timeline that matches the cues in
 * `scripts/demo-knowlex/narration.json`. Target runtime ~33 s.
 *
 * Timing contract (both sides must agree — narration.json v2 cues):
 *
 *   0.0  s  : /kb loads, heading visible
 *   0.8  s  : narration line 1 (~3 s at 1.3x)
 *   3-6  s  : fill title + content (slowMo 250 ms makes this visible)
 *   6.0  s  : narration line 2 (~5.5 s at 1.25x)
 *   6-12 s  : click Ingest, server replies
 *   12-13.5 s : navigate to /, fill question
 *   13.5 s  : narration line 3 (~4 s at 1.25x)
 *   14-20 s : Ask click + Gemini streams the answer with citations
 *   20.0 s  : narration line 4 (~3.5 s at 1.25x)
 *   20-27 s : /api/kb/stats JSON on screen
 *   27.0 s  : narration line 5 (~3 s at 1.25x)
 *   27-33 s : /docs/api scrolling
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

  // The /kb form uses visual <label> elements that aren't tied to
  // the inputs via htmlFor+id, so `getByLabel` doesn't resolve them.
  // Placeholder text is the most stable anchor; if these strings
  // change in CorpusClient.tsx, update them here.
  const titleField = page.getByPlaceholder("e.g. Boardly overview");
  const contentField = page.getByPlaceholder(
    /^Paste a passage/i, // matches the CONTENT textarea regardless of the full placeholder suffix
  );
  await titleField.fill(DEMO_DOC.title);
  await contentField.fill(DEMO_DOC.content);

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
