#!/usr/bin/env node
/**
 * Knowlex corpus cleanup — fully wipe the live corpus by listing
 * every document via `GET /api/kb/documents` and deleting each via
 * `DELETE /api/kb/documents?id=...`.
 *
 * Run after deploying ADR-0050's title-based UPSERT to clear the
 * pre-dedup accumulation. Subsequent eval re-seeds will then upsert
 * cleanly and the corpus stays at the golden-set 10 docs.
 *
 * Honours Knowlex's per-IP limiter (10 req / 60 s sliding window —
 * `apps/knowledge/src/lib/kb-rate-limit.ts`) by spacing deletes 7 s
 * apart, mirroring the eval client's pacing in `eval.ts`. The
 * `/api/kb/documents` GET (read) hits the same limiter, so the list
 * fetch is a single call and only the per-id deletes need pacing.
 *
 * Usage:
 *   E2E_BASE_URL=https://craftstack-knowledge.vercel.app \
 *     node apps/knowledge/scripts/cleanup-corpus.mjs
 *
 *   # Dry run — list what would be deleted, delete nothing:
 *   E2E_BASE_URL=... DRY_RUN=1 \
 *     node apps/knowledge/scripts/cleanup-corpus.mjs
 *
 * No DATABASE_URL needed — operates entirely through the public HTTP
 * surface, so this script can run from any developer machine without
 * Vercel env access.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const DRY_RUN = process.env.DRY_RUN === "1";
const DELAY_MS = 7000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[cleanup] base=${BASE_URL} dry-run=${DRY_RUN ? "yes" : "no"}`);

  const listRes = await fetch(`${BASE_URL}/api/kb/documents`);
  if (!listRes.ok) {
    const body = await listRes.text().catch(() => "");
    throw new Error(`list failed: ${listRes.status} ${body.slice(0, 200)}`);
  }
  const docs = await listRes.json();
  if (!Array.isArray(docs)) {
    throw new Error(
      `list returned non-array: ${JSON.stringify(docs).slice(0, 200)}`,
    );
  }

  console.log(`[cleanup] found ${docs.length} documents`);
  for (const d of docs) {
    console.log(`  - ${d.id} "${d.title}" (${d.chunks} chunks)`);
  }

  if (DRY_RUN) {
    console.log("[cleanup] dry-run, exiting without deleting");
    return;
  }

  if (docs.length === 0) {
    console.log("[cleanup] nothing to delete");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (i > 0) {
      await sleep(DELAY_MS);
    }
    const url = `${BASE_URL}/api/kb/documents?id=${encodeURIComponent(d.id)}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.status === 204) {
      ok += 1;
      console.log(`  [${i + 1}/${docs.length}] deleted ${d.id} "${d.title}"`);
    } else {
      failed += 1;
      const body = await res.text().catch(() => "");
      console.error(
        `  [${i + 1}/${docs.length}] FAILED ${d.id}: ${res.status} ${body.slice(0, 200)}`,
      );
    }
  }

  console.log(`[cleanup] done: ${ok} deleted, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[cleanup] crashed:", err);
  process.exit(1);
});
