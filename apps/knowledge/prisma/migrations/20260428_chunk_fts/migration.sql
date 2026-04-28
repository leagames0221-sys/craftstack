-- ADR-0063 (closes ADR-0011 deferred): Hybrid retrieval — Postgres FTS
-- (tsvector + GIN) alongside pgvector cosine kNN, fused via Reciprocal
-- Rank Fusion at the application layer.
--
-- This migration adds:
--   1. A generated tsvector column `Chunk.tsv` derived from
--      `Chunk.content` via to_tsvector('english', content). Generated
--      means it's maintained by Postgres on every insert/update — no
--      app-side trigger to keep in sync.
--   2. A GIN index on the new column for sub-millisecond `@@` lookups.
--
-- The column + index are additive: existing pgvector cosine retrieval
-- is unchanged. The hybrid path is gated by `HYBRID_RETRIEVAL_ENABLED`
-- env flag and lights up only when the operator opts in. Until then,
-- the column is generated + indexed at no app behavior cost (Postgres
-- maintains the index automatically on every chunk insert).
--
-- Rationale for Postgres native FTS over external BM25:
--   - tsvector + ts_rank_cd is the closest BM25-equivalent in pgvector-
--     compatible Postgres without adding a new search service.
--   - GIN index gives O(log N) lookup on the @@ operator, not O(N) scan.
--   - Same database (knowlex-db), same connection pool, same auth — no
--     ops surface added. ADR-0046 free-tier compliance preserved.
--
-- Storage cost: the generated tsv column adds roughly 1.5x the chunk's
-- token count in bytes (each unique token + position list). For our
-- 512-char chunks this is ~150-300 bytes per chunk. The GIN index
-- itself is comparable. Negligible at portfolio-scale corpora (sub-10k
-- chunks).

ALTER TABLE "Chunk"
  ADD COLUMN "tsv" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

CREATE INDEX "Chunk_tsv_gin_idx" ON "Chunk" USING GIN ("tsv");
