# Knowlex RAG evaluation

Eval is the last line of defense against silent retrieval regressions. Every PR touching Knowlex AI code will run the suite; any threshold breach blocks merge.

> **Status**: Knowlex itself is pre-implementation in v0.1.0. The golden QA set and threshold manifest are checked in, but the CI job and first measured report land when the ingestion pipeline ships (Week 12). Numbers referenced in ADRs are targets, not measurements.

## What is measured

| Metric            | Definition                                                         | Threshold |
| ----------------- | ------------------------------------------------------------------ | --------- |
| Context Precision | Retrieved chunks that are actually relevant                        | ≥ 0.80    |
| Context Recall    | Expected chunks that appear in retrieval                           | ≥ 0.75    |
| Faithfulness      | Claims in the answer backed by cited chunks                        | ≥ 0.85    |
| Answer Relevance  | Cosine similarity between answer embedding and question embedding  | ≥ 0.80    |
| Latency p95       | End-to-end time including retrieve, rerank, generate, faithfulness | ≤ 1500ms  |

## Layout

```
docs/eval/
├── README.md               # this file
├── golden_qa.yaml          # curated set
└── reports/                # YYYY-MM-DD.json, committed by nightly CI
```

## Running locally

```bash
pnpm --filter knowledge exec tsx scripts/run-eval.ts --subset 10
pnpm --filter knowledge exec tsx scripts/run-eval.ts --full
```

Requires `GEMINI_API_KEY` and a populated `knowlex-db` with the test documents seeded.

## CI behavior

- Pull request: `--subset 10`
- Push to main: `--full`
- Nightly (cron): `--full`, writes a report file, auto-commits

See [ADR-0015](../adr/0015-eval-in-ci.md).
