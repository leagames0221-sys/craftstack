import { expect, test } from "@playwright/test";

/**
 * Knowlex demo recording — drives the Ask → citation → stats →
 * /docs/api flow at a pace that matches
 * `scripts/demo-knowlex/narration.json`. The timestamps in that JSON
 * were chosen against this script; if you reorder steps, re-run
 * `pnpm demo:knowlex:tts` and `pnpm demo:knowlex:compose` to realign.
 *
 * Runs against the live Vercel deploy by default (the whole point of
 * this demo is to prove the live deploy works). Override with
 * `DEMO_BASE_URL=http://localhost:3001` to record against a local
 * dev server instead.
 *
 * No auth. No DB mutation beyond the single Ingest the narration
 * mentions — the document is titled "demo-walkthrough-<timestamp>"
 * so repeated runs don't deduplicate each other.
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
  // 0-5 s — open /kb, show the corpus UI, start ingest.
  await page.goto("/kb");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(1000);

  // Paste the doc + ingest.
  const titleField = page.getByLabel(/title/i);
  const contentField = page.getByLabel(/content|body|text/i).first();
  if (await titleField.isVisible().catch(() => false)) {
    await titleField.fill(DEMO_DOC.title);
  }
  if (await contentField.isVisible().catch(() => false)) {
    await contentField.fill(DEMO_DOC.content);
  }
  const ingestBtn = page
    .getByRole("button", { name: /ingest|add|save/i })
    .first();
  if (await ingestBtn.isVisible().catch(() => false)) {
    await ingestBtn.click();
    await page.waitForTimeout(2500);
  } else {
    // If the ingest form isn't structured as expected, at least pause so
    // the narration cue about chunking still lines up over the /kb view.
    await page.waitForTimeout(3000);
  }

  // 12 s — go ask a question.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const questionField = page.getByRole("textbox").first();
  await questionField.fill(DEMO_QUESTION);
  await page.getByRole("button", { name: /^ask$/i }).click();

  // Streaming answer + citations land over the next ~6 seconds.
  await page.waitForTimeout(6000);

  // 19 s — show the stats endpoint as a separate navigation.
  await page.goto("/api/kb/stats");
  await page.waitForTimeout(4500);

  // 24 s — show the /docs/api reference.
  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Scroll down through the tag groups so the video has some motion.
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(2500);
});
