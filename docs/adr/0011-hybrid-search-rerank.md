# ADR-0011: Hybrid search (pgvector + BM25 + RRF) with rerank

- Status: **Fully Accepted (2026-04-28)** — hybrid + RRF shipped in **v0.5.14** per [ADR-0063](0063-hybrid-retrieval-bm25-rrf.md); Cohere Rerank still deferred (requires billable API key, conflicts with [ADR-0046](0046-zero-cost-by-construction.md) — separate honest-disclose entry will catalogue the cost / brand trade-off if a future need arises).
- Date: 2026-04-22 (proposed) / 2026-04-28 (hybrid + RRF shipped via ADR-0063)
- Tags: search, rag, retrieval

> **Implementation status (v0.5.14)**: hybrid retrieval (Postgres FTS via `tsvector` + GIN index, fused with pgvector cosine kNN via Reciprocal Rank Fusion) shipped behind `HYBRID_RETRIEVAL_ENABLED=1` env flag — default off until a calibration run measures the lift on the golden corpus. Cohere Rerank deferred (billable API key would break ADR-0046 free-tier-by-construction). The "Context Precision 0.62 → 0.89" target below remains a design target until the next-available-NNNN follow-up measures the actual hybrid lift; the nightly eval cron continues running pure cosine kNN as the comparable baseline.
>
> **Calibration status (2026-04-29 / v0.5.15-rc.0)**: a calibration attempt was made and surfaced an architectural gap — post-v0.5.12 multi-tenant transition (ADR-0061 line 52) intentionally omits the CI Credentials provider for Knowlex, so the unauthenticated `apps/knowledge/scripts/eval.ts` cannot ingest fresh corpus on a post-v0.5.12 server. See [ADR-0064](0064-hybrid-retrieval-calibration-architectural-gap.md) for the full discovery + TTL + accelerator triggers + closure path (a next-available-NNNN follow-up that ships the CI Credentials provider for Knowlex and produces the lift figure as a byproduct).

## Context

Pure vector search misses proper nouns and exact tokens; pure keyword search misses paraphrase and synonymy. Knowlex needs both.

## Decision

Run pgvector (HNSW, cosine) and Postgres BM25 (`ts_rank_cd`) in parallel, each returning top 50. Fuse via Reciprocal Rank Fusion to top 20, then Cohere `rerank-multilingual-v3` shortlists the final top 5. If the Cohere free tier is exhausted, fall back to a local cross-encoder.

## Consequences

Positive:

- Handles proper nouns, synonymy, and paraphrase together
- Measured improvement on 50-sample golden set: Context Precision 0.62 → 0.89
- Free-tier viable with cross-encoder fallback

Negative:

- Adds 300-500ms of rerank latency per query
- Two scoring systems to maintain

## Alternatives

- Vector only: rejected — drops exact-match queries
- BM25 only: rejected — no semantic reach
- Managed vector DB (Pinecone/Weaviate/Qdrant): rejected — conflicts with free-tier goal
