# ADR-0041: Replace pgvector ivfflat index with HNSW for Knowlex kNN

- Status: Accepted
- Date: 2026-04-24
- Tags: knowlex, pgvector, database, retrieval

## Context

The Knowlex MVP (ADR-0039) shipped with an ivfflat cosine-distance index on `Embedding.embedding` created via the initial migration `20260423_init`:

```sql
CREATE INDEX "Embedding_embedding_cosine_idx"
  ON "Embedding" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
```

The intent recorded in the migration comment was "forward-compat placeholder; a seq-scan is fast enough for hundreds of chunks." In production this assumption turned out to be silently wrong.

### Observed failure (Session 252 → 253)

Against the live `knowlex-db` on Neon with a corpus of **1 Document / 2 Chunks / 2 Embeddings (all 768-dim)**:

1. `POST /api/kb/ingest` — succeeds. All rows written, FK integrity preserved.
2. `POST /api/kb/ask` — the kNN `SELECT ... FROM "Embedding" ORDER BY embedding <=> $1::vector LIMIT k` returns **zero rows**, producing the user-visible answer _"The provided passages do not contain information on..."_.

A diagnostic run in the same request, same Prisma client, same connection confirmed:

| Check                                                      | Result                                  |
| ---------------------------------------------------------- | --------------------------------------- |
| `COUNT(*) FROM "Embedding"`                                | 2                                       |
| `MAX(vector_dims(embedding))`                              | 768                                     |
| Query-vector `length`                                      | 768                                     |
| `LEFT JOIN "Chunk"` reaches chunk row                      | ✅ both rows                            |
| `LEFT JOIN "Document"` reaches document row                | ✅ both rows                            |
| `e.embedding <=> '[...]'::vector` inside diagnostic SELECT | valid finite distances (0.3227, 0.3363) |

So the data was present, FK-consistent, dimensionally correct, and `<=>` produced valid distances — yet the production query with `ORDER BY <=> LIMIT k` returned nothing.

### Root cause

This is a well-known pgvector pathology when ivfflat is used on small corpora. ivfflat partitions vectors into `lists` inverted lists at build time; at query time the planner visits `ivfflat.probes` of those lists (default **1**). With:

- `lists = 100` (our migration)
- `probes = 1` (default; we never tuned it)
- rows = 2

…the planner chose an index-scan path that probed 1 of 100 lists, and almost never the one that happened to hold our 2 rows. The diagnostic `LEFT JOIN` query didn't have `ORDER BY <=>`, so the planner fell back to a sequential scan over `Embedding`, which saw all 2 rows.

In other words: **the kNN query failed precisely when the optimiser decided the ivfflat index was useful**. That's the worst possible failure mode — it looks dimensionally and relationally correct from every diagnostic angle, but silently discards results.

## Decision

Replace ivfflat with an **HNSW** index (`pgvector >= 0.5`, available on Neon's default PostgreSQL 16 build):

```sql
-- Migration 20260424_hnsw
DROP INDEX IF EXISTS "Embedding_embedding_cosine_idx";

CREATE INDEX "Embedding_embedding_cosine_idx"
  ON "Embedding" USING hnsw ("embedding" vector_cosine_ops);
```

We keep the same index name to avoid churn in the retrieve path, and we accept the default HNSW build parameters (`m = 16`, `ef_construction = 64`) as adequate for our working set ceiling.

The `retrieve.ts` SQL is unchanged — the query uses the standard `ORDER BY <=> $1::vector LIMIT $2` shape that both index types answer. The parameterised bind (`$1` / `$2`) was restored once the index swap made it reliable again; the earlier experiment with inlined literals was a dead-end diagnostic rather than a real fix.

## Consequences

Positive:

- **kNN works at every corpus size.** HNSW traverses a navigable-small-world graph with no `probes`-style cutoff, so whether the table holds 2 rows or 2 million rows the query returns meaningful results. (Latency under load is unmeasured at this stage; a `pnpm --filter knowledge bench` script is a planned follow-up before the corpus grows past ~10k chunks.)
- Eliminates a class of silent-empty-result bugs that are nearly impossible to detect from application code without schema-aware integration tests.
- Modern default. pgvector's own docs now recommend HNSW over ivfflat for "most workloads where recall matters more than index build time."
- The migration is forward-compatible: future scale tuning can adjust `m` / `ef_construction` or add `ef_search` at query time without another DDL round.

Negative:

- HNSW index builds are slower and use more memory than ivfflat at the same row count. At our ceiling this is irrelevant; if we ever ingest hundreds of thousands of chunks we can rebuild with CONCURRENTLY or partition.
- HNSW query cost is slightly higher than a tuned ivfflat for very large corpora at fixed recall. Not a concern at portfolio scale; we prioritise correctness-by-default.

## Alternatives considered

1. **Keep ivfflat, raise `probes`.** Setting `SET LOCAL ivfflat.probes = 100` before the kNN query would force a full list scan. Rejected: it restores correctness only by defeating the index entirely, while paying the index maintenance cost on every write. Also brittle on pooled connections where `SET LOCAL` semantics interact with transaction scoping.
2. **Drop the index, rely on seq-scan.** Cheapest fix, fine at our scale. Rejected because having a real vector index is a more honest representation of the architecture we would ship at scale, and HNSW has no worse failure modes than no index at all.
3. **Keep ivfflat and retrain `lists` after each ingest.** pgvector recommends `lists ≈ rows / 1000` for ivfflat to work well. Implementing this as an ingest-time rebuild is operationally expensive and still leaves a window where the index is wrong. Rejected.

## Follow-ups (not blocking this ADR)

- Add an integration test that seeds ≥ 3 documents and asserts `retrieveTopK` returns the expected chunk — the test that, had it existed, would have caught the ivfflat failure before production.
- Document the HNSW → tuned-HNSW scaling path (raise `m` / `ef_construction`, add runtime `ef_search`) in the Knowlex design note once the corpus crosses 10k chunks, with a `pnpm --filter knowledge bench` script to measure p50/p99 latency and recall against a held-out golden set.

## Shipped alongside this ADR

- `GET /api/kb/stats` — operational probe returning `{ documents, chunks, embeddings, orphanEmbeddings, storedDim, expectedDim, embeddingModel, indexType }`. Had this existed, diagnosing the ivfflat failure would have been a single `curl` instead of four diagnostic commits.
- `ingestDocument` wrapped in `prisma.$transaction` so a DB failure mid-ingest no longer leaves partial Document/Chunk/Embedding state. (The previous JSDoc claimed this; the code didn't.)
- `gemini.ts::embedTexts` unified onto `embedMany` for every call (single- and multi-value) with a post-hoc dimensionality assert, removing a class of silent bugs where `embed()` and `embedMany()` could have diverged on `providerOptions` handling.
