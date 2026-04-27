# ADR-0050: Knowlex ingest deduplication — title-based UPSERT

- Status: Accepted
- Date: 2026-04-25
- Tags: knowlex, rag, ingest, retrieval-quality, eval
- Supersedes (on dedup semantics): the "duplicates from earlier runs are tolerated" clause of [ADR-0039](0039-knowlex-mvp-scope.md)

## Context

[ADR-0039 § Decision § 5](0039-knowlex-mvp-scope.md) asserted that
"duplicates from earlier runs are tolerated because the retriever ranks
by cosine distance, not recency." That stance was correct for the
single-shot ingest workflow it was written against — a user pastes
text, the corpus grows by one doc, retrieval ranks the new chunks
alongside the old ones with no duplicates in the seed.

Once the RAG eval workflow (ADR-0049) started seeding the same
10-document v3 golden corpus into the same live deploy on every
nightly cron, the "tolerated" stance broke down. The 2026-04-25
session shipped four eval iterations on the same Vercel deploy:

| Run        | Time (UTC) | Corpus state at run     | Pass rate                     | p95 latency |
| ---------- | ---------- | ----------------------- | ----------------------------- | ----------- |
| 1 (cron)   | 05:52      | 2 docs / 3 chunks       | crash @ ingest 1 (cold-start) | n/a         |
| 2 (manual) | 08:25      | 12 docs / ~33 chunks    | 11/30, then 429 cascade       | n/a         |
| 3 (manual) | 08:36      | 22 docs / ~53 chunks    | **19/30 = 63%**               | 8388 ms     |
| 4 (manual) | 09:03      | **32 docs / 63 chunks** | **1/30 = 3.3%**               | 8572 ms     |

Between run 3 and run 4 the eval script was unchanged (only
`docs/eval/golden_qa.json` thresholds were touched). The only
substantive variable was the corpus state. Direct observation after
run 4:

```
$ curl -s https://craftstack-knowledge.vercel.app/api/kb/stats
{"documents":32,"chunks":63,"embeddings":63,"orphanEmbeddings":0,
 "storedDim":768,"expectedDim":768,
 "embeddingModel":"gemini-embedding-001","indexType":"hnsw"}

$ curl -N -X POST https://craftstack-knowledge.vercel.app/api/kb/ask \
    -H 'content-type: application/json' \
    -d '{"question":"What pgvector index type does Knowlex use for kNN retrieval?"}'
HTTP/1.1 200 OK
X-Knowlex-Docs: demo-walkthrough-1776971630671|Knowlex RAG architecture|Workspace tenancy and four-tier RBAC
X-Knowlex-Hits: 6
Content-Length: 0
[empty body, even with -N to disable curl's buffering]
```

Retrieval still surfaces the right citation document
(`Knowlex RAG architecture`) in the response header, so the kNN
mechanic itself is healthy. What changed is the _content_ of the
top-K chunks: with 32 documents containing 3-4 copies of each golden
doc, the cosine kNN top-6 is dominated by near-identical chunks from
the duplicates. That uniform context, fed to Gemini 2.0 Flash via the
streaming `generateText` path, returns an empty body — consistent
with Gemini's documented behaviour around `finishReason: RECITATION`
or `SAFETY` filters when input prompts contain heavy repetition or
near-verbatim text from the same source.

The eval mechanism is not broken. The retrieval mechanism is not
broken. The corpus accumulation pattern is broken: re-ingest is
allowed to multiply rows instead of replace them, and the LLM
silently fails on the resulting prompt shape.

## Decision

Replace the "tolerated duplicates" stance with **title-based UPSERT
semantics** at the ingest boundary. Specifically, in
`apps/knowledge/src/server/ingest.ts` `ingestDocument(opts)`:

1. Inside the existing `prisma.$transaction`, before creating the new
   `Document`, run `tx.document.deleteMany({ where: { title } })`.
2. Cascade is handled by the Prisma schema's existing
   `onDelete: Cascade` rules: `Chunk → Document` and
   `Embedding → Chunk` both cascade, so a single `deleteMany` on
   `Document` cleans up rows in all three tables atomically.
3. If the dedup deleted any rows, log a single
   `[ingest] dedup: removed N prior Document(s) titled "<title>"`
   line so re-seed activity is visible in the Vercel function log.
4. The transaction continues with the standard create + chunks +
   embeddings flow unchanged.

The contract becomes: **`POST /api/kb/ingest` with the same `title`
twice yields one `Document` row in the final state, not two.** Embedding
work is repeated (the embeddings of the new content replace the
embeddings of the old content), which costs one full embed-batch per
re-ingest. That cost is acceptable because the alternative — keeping
the old chunks live alongside the new ones — is what produced the
empty-body LLM response in run 4.

### Cascade audit

Verified against `apps/knowledge/prisma/schema.prisma` at the v0.5.x
HEAD:

```prisma
model Chunk {
  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
}

model Embedding {
  chunk Chunk @relation(fields: [chunkId], references: [id], onDelete: Cascade)
}
```

So `tx.document.deleteMany({ where: { title } })` cascades to
`Chunk` and then to `Embedding` in a single transaction.
`/api/kb/stats` `orphanEmbeddings` will continue to read 0 after
this change.

### Cleanup of the existing pre-dedup accumulation

The 32 documents already in the live deploy at the time of this ADR
are not touched by the dedup logic on their own — they remain until a
re-ingest of each title fires the `deleteMany`. To restore the corpus
to a clean state in one operation, a new
`apps/knowledge/scripts/cleanup-corpus.mjs` script lists every
document via `GET /api/kb/documents` and deletes each via
`DELETE /api/kb/documents?id=...`, with 7-second pacing to honour the
per-IP limiter (the same pacing eval.ts uses, ADR-0049 § Rate-limit-
aware contract). Run once, post-deploy, then the next nightly cron
re-seeds 10 docs into a clean DB and steady-state is locked at 10.

## Consequences

**What changes for retrieval quality**

- After deploy + cleanup, `/api/kb/stats` `documents` stays at 10
  (the v3 golden-set size) regardless of how many times the eval cron
  re-seeds. Top-K cosine kNN sees diverse content again.
- The empty-body LLM response observed at run 4 should not recur
  because the prompt fed to Gemini will not contain N near-verbatim
  copies of the same chunk.
- Run 5 (the post-fix verification) is expected to land at the
  ~63% pass rate observed in run 3, not the 3.3% from run 4. Pass
  rate above 63% is a separate v0.6.0 RAG-improvement arc
  (substring AND→OR, expanded REFUSAL_MARKERS, LLM-as-judge).

**Trade-offs admitted**

- **Embed cost on re-ingest is now mandatory.** Every re-ingest of an
  existing title pays for a fresh embedding batch (10 docs × ~3
  chunks × 768-dim ≈ 30 embed calls per nightly run). At AI Studio
  Free's 1500 RPD cap this is comfortable; at higher corpus sizes
  it could matter. A cheaper "skip if content hash matches" path is
  named in `Not in scope` below.
- **Title is the dedup key, not content hash.** Two ingests with the
  same title but different bodies will replace rather than merge or
  version. ADR-0039 deliberately deferred document versioning; this
  ADR keeps that deferral explicit. If/when versioning lands, the
  dedup key would shift to a stable composite (workspace + title +
  contentHash, with explicit version semantics on collision).
- **Cleanup script needs the per-IP limiter pacing.** Deleting 32
  documents at 7s spacing is ~3.5 minutes of single-purpose
  operation. Acceptable as a one-off post-deploy step.
- **The transaction window grows by one DELETE.** For the typical
  case (no existing duplicate), it's a fast no-op WHERE-not-found
  scan. For the dedup case, it's a cascading delete of 1 doc + ~3
  chunks + ~3 embeddings — negligible relative to the embedding
  round-trip that dominates ingest time.
- **ADR-0039's "duplicates tolerated" sentence is now stale.** Marked
  Superseded on the dedup dimension at the top of this ADR.

**What this unblocks**

- ADR-0049's three-night nightly cron Scenario C plan can land
  cleanly: each night re-seeds the same 10 docs and the corpus stays
  at 10. v0.5.1 README badge becomes a stable "pass 63% / p95 8.4 s"
  number.
- Future workspace tenancy (ADR-0047) gets a cleaner scoping
  primitive: dedup key becomes `(workspaceId, title)` rather than
  bare `title`, with no behavioural change for the single-tenant
  default workspace.

## Related

- [ADR-0039](0039-knowlex-mvp-scope.md) — original "duplicates tolerated" stance, superseded on dedup semantics
- [ADR-0041](0041-knowlex-ivfflat-to-hnsw.md) — HNSW index choice; this ADR's dedup keeps the index from churning on ghost rows
- [ADR-0046](0046-zero-cost-by-construction.md) — the per-IP limiter and cost-safety regime cleanup-corpus.mjs honours
- [ADR-0049](0049-rag-eval-client-retry-contract.md) — § 4th arc (added in this same session) records the run-4 observation that motivated this ADR
- `apps/knowledge/src/server/ingest.ts` — the changed code path
- `apps/knowledge/scripts/cleanup-corpus.mjs` — one-off post-deploy DB cleanup

## Not in scope

- Content-hash dedup (skip the embed call when the new body's hash matches the existing). Cheaper, but adds a hash column or a separate index. Tracked as a future optimisation if embed cost becomes load-bearing.
- Document versioning. ADR-0039's deferral stays — UPSERT with replace is the v0.5.x stance; explicit version history is a v0.6.0+ concern.
- Multi-tenant dedup key extension (`(workspaceId, title)`). Lands together with ADR-0047 implementation in Session 256-A.
- Refusal-marker expansion / substring-AND→OR scoring. **Shipped in v0.5.1** per ADR-0049 § 7th arc (originally tracked as v0.6.0 work in § Measured baseline + improvement headroom; brought forward after run 6 trade-off observation).
