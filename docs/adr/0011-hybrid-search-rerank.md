# ADR-0011: Hybrid search (pgvector + BM25 + RRF) with rerank

- Status: **Accepted (planned)** — design-phase decision; **deferred for v0.5.2** per [ADR-0039](0039-knowlex-mvp-scope.md) MVP scope (pure pgvector HNSW cosine kNN ships; hybrid + RRF + Cohere rerank remain on roadmap)
- Date: 2026-04-22
- Tags: search, rag, retrieval

> **Implementation status (v0.5.2)**: not implemented. ADR-0039 explicitly defers hybrid retrieval / Cohere Rerank / cross-encoder fallback to a later arc. The MVP demonstrates the full ingest → embed → store → retrieve → stream pipeline with pure cosine kNN, sufficient for the corpus sizes that fit a portfolio demo. The "Context Precision 0.62 → 0.89" measurement below is a design target, not a current measurement — the nightly RAG eval cron measures the v0.5.2 pure-cosine-kNN system; see [`docs/eval/`](../eval/) for actual numbers.

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
