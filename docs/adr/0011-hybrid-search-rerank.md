# ADR-0011: Hybrid search (pgvector + BM25 + RRF) with rerank

- Status: Accepted
- Date: 2026-04-22
- Tags: search, rag, retrieval

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
