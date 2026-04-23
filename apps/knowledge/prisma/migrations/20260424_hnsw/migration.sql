-- Swap ivfflat -> HNSW for cosine kNN on Embedding.embedding.
--
-- Why:
--   ivfflat's default `lists=100` combined with the default
--   `ivfflat.probes=1` probes only 1 of 100 inverted lists per query.
--   For a small corpus (<~1000 rows) the 2-3 rows that actually exist
--   are almost never in the probed list, so kNN returns 0 rows even
--   though the data is present and dimensionally correct. We hit this
--   in production (S252): `SELECT COUNT(*) FROM "Embedding"` returned 2
--   and `<=>` produced valid distances in a LEFT JOIN diagnostic, but
--   the production `ORDER BY <=> LIMIT k` query returned [].
--
-- HNSW (pgvector >= 0.5) traverses a navigable-small-world graph with
-- no probe cutoff, so a tiny corpus is not a failure mode. The graph
-- cost is higher at index build time but negligible for our expected
-- <100k row ceiling on the free tier.
--
-- Default HNSW parameters (m=16, ef_construction=64) are fine for our
-- scale; we can tune via migrations if recall ever becomes an issue.

DROP INDEX IF EXISTS "Embedding_embedding_cosine_idx";

CREATE INDEX "Embedding_embedding_cosine_idx"
  ON "Embedding" USING hnsw ("embedding" vector_cosine_ops);
