# ADR-0015: RAG evaluation integrated into CI

- Status: Accepted
- Date: 2026-04-22
- Tags: ai, ci, quality

## Context

Prompt tweaks, chunking changes, and model swaps can silently regress retrieval quality. Manual testing misses the regressions.

## Decision

Maintain 50 curated Q&A samples in `docs/eval/golden_qa.yaml`. Each PR touching `apps/knowledge/src/server/ai/**` or `docs/eval/**` runs a 10-sample subset. Pushes to main and nightly runs execute the full 50. The job computes Context Precision, Context Recall, Faithfulness, Answer Relevance, and p95 Latency. Thresholds: 0.80 / 0.75 / 0.85 / 0.80 / 1500ms. Any breach fails CI.

## Consequences

Positive:

- Regressions become impossible to miss
- Quantitative evidence in PR reviews
- A genuine "eval-driven AI development" line for the resume

Negative:

- Each run consumes Gemini free quota; sub-sampling keeps it within budget
- Golden set requires ongoing curation

## Alternatives

- Manual evaluation only: rejected — does not scale with iteration speed
- Production A/B only: rejected — defects reach users
