# ADR-0012: Embedding separated into its own table

- Status: Accepted
- Date: 2026-04-22
- Tags: data-model, ai

## Context

Embedding models change. We want to try new models without rewriting `Chunk` rows or losing the source text.

## Decision

Keep `Chunk` as the text-and-metadata store. Put the vector into a dedicated `Embedding` table (`chunkId` PK, `model`, `dim`, `vector(768)`). HNSW index lives on `Embedding.embedding`.

## Consequences

Positive:

- Switching models reindexes `Embedding` only; `Chunk` stays stable
- A/B embedding experiments can coexist by `model` column
- HNSW stays focused on a smaller, narrower table

Negative:

- One extra JOIN on hot retrieval paths

## Alternatives

- Vector column on `Chunk`: rejected — forces Chunk rewrites on model change
