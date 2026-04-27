# Knowlex RAG evaluation

Eval is the last line of defense against silent retrieval regressions. A shallow-but-working harness ships today; a deeper LLM-as-judge layer is a follow-up.

## What is measured today

`apps/knowledge/scripts/eval.ts` runs the set in [`golden_qa.json`](./golden_qa.json) against a live Knowlex deployment (`E2E_BASE_URL`) or a local dev server. Each question is scored on three proxies:

| Signal                | Implementation                                                                                                                                                    | Proxy for      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Answer substrings** | every `expectedSubstrings[*]` must appear in the answer body (case-insensitive)                                                                                   | Faithfulness   |
| **Citation coverage** | `expectedDocumentTitle` must appear in the `x-knowlex-docs` response header                                                                                       | Context recall |
| **Refusal handling**  | adversarial / off-corpus questions flagged with `expectedRefusal: true` must not invent an answer — refusal markers ("do not contain", "cannot", ...) must appear | Robustness     |
| **Latency p95**       | wall-clock of the Ask request, p95 across all questions ≤ `thresholds.maxP95LatencyMs`                                                                            | UX             |

Exit code:

- Pass rate ≥ `thresholds.minPassRate` AND p95 latency ≤ `thresholds.maxP95LatencyMs` → exit 0
- Otherwise → exit 1 (safe to wire into a nightly workflow)

## What is explicitly NOT measured yet

- **LLM-as-judge faithfulness.** Substring check catches the coarsest failures (answer invents a model name, cites the wrong doc) but not subtle hallucinations. A follow-up pass using `gemini-2.5-pro` as a rubric judge is tracked in ADR-0043's follow-ups.
- **Multilingual evaluation.** Corpus is English-only. The `expectedSubstrings` check would need per-locale transforms.

Numbers from earlier ADRs that reference `contextPrecision ≥ 0.80` and `faithfulness ≥ 0.85` are **targets for the deeper (LLM-as-judge) harness**, not the substring check shipped today.

### v3 corpus — portfolio-as-domain

As of v3 (2026-04-24, v0.4.3 arc), the golden set expanded from **3 hand-written documents / 10 questions** to **10 documents / 30 questions**. The corpus is deliberately self-referential: every document describes a real architectural decision or subsystem in the monorepo (Knowlex RAG architecture, Boardly realtime, security posture, cost-safety regime, undo/redo semantics, workspace tenancy, LexoRank ordering, token-hashed invitations, deployment topology, observability pipeline). A cold reviewer pointing `/kb/ask` at questions from this set exercises exactly the surface a hiring conversation would probe — "how does Boardly handle concurrent edits?", "which ADR introduces the free-tier compliance gate?", "what hash algorithm does the invitation system use?".

This shape unlocks context-precision signal that was trivially-passing under the 3-doc set: with 10 docs and 30 questions across factual / reasoning / adversarial categories, retrieval now has to make real ranking calls, and `x-knowlex-docs` citation correctness becomes a meaningful metric.

## Layout

```
docs/eval/
├── README.md           # this file
└── golden_qa.json      # self-contained seed corpus + questions
```

## Running

```bash
# against local dev server (pnpm dev:knowledge, port 3001)
E2E_BASE_URL=http://localhost:3001 pnpm --filter knowledge eval

# against live Vercel deploy
E2E_BASE_URL=https://craftstack-knowledge.vercel.app pnpm --filter knowledge eval
```

Requires `GEMINI_API_KEY` on the target server (the eval hits the live ingest + ask endpoints). The script seeds its own corpus at the start of each run; duplicates from earlier runs are tolerated because the retriever ranks by cosine distance, not by recency.

## Authoring new questions

`golden_qa.json` has two top-level arrays:

- `corpus[i]`: `{ title, content }` — pasted into `/api/kb/ingest`.
- `questions[i]`: `{ id, category, question, expectedSubstrings, expectedDocumentTitle }` or `{ id, category, question, expectedRefusal: true }`.

Prefer questions where the expected answer contains distinctive, low-ambiguity substrings (model names, specific numbers, protocol names). Avoid scoring on style or phrasing.

## Reports (v0.5.3+ — auto-emitted by eval.ts)

`apps/knowledge/scripts/eval.ts` emits a JSON report to `docs/eval/reports/YYYY-MM-DD.json` at the end of every run, regardless of pass/fail. Schema (v1):

```jsonc
{
  "schemaVersion": 1,
  "ranAt": "2026-04-28T04:14:00.000Z",
  "baseUrl": "https://craftstack-knowledge.vercel.app",
  "goldenVersion": 4,
  "goldenSize": { "questions": 30, "corpus": 10 },
  "thresholds": { "minPassRate": 0.6, "maxP95LatencyMs": 10000 },
  "aggregate": {
    "passed": 24,
    "total": 30,
    "passRate": 0.8,
    "passRatePct": 80.0,
    "latencyP50Ms": 4321,
    "latencyP95Ms": 8800,
    "passRateOk": true,
    "latencyOk": true,
    "overallPass": true,
  },
  "outcomes": [
    {
      "id": "q001",
      "category": "factual",
      "passed": true,
      "latencyMs": 4123,
      "reasons": [],
    },
    // ...
  ],
}
```

The eval workflow's `actions/upload-artifact@v4` step picks these up automatically. `if-no-files-found: ignore` is preserved as a safety net (a crashed eval still uploads whatever exists). The eventual auto-commit-to-main step (Tier C-#2 follow-up) will consume this directly to populate the README badge.

## Follow-ups

- **Auto-commit eval reports to main on green runs (Tier C-#2)**. The eval workflow currently runs with `permissions: contents: read`. Flipping to `contents: write` and adding a `git commit -am` step gives main a tracked time-series of measurements without manual intervention. Defer until at least one stable report week has been observed, to avoid the workflow-spam class of bug.
- **Measured numbers on the README badge**. Once one report file exists, the main `README.md` gains an eval badge showing `passRate / p95Ms` from the latest report. Turns the `hire` → `strong hire` probe (measured eval numbers) into a repo-visible answer.
- **LLM-as-judge `--judge` flag**. Optional post-processing pass that posts answers to `gemini-2.5-pro` with a rubric prompt for true faithfulness scoring. Gated as a separate env-toggled CI job so the default eval stays zero-cost-on-free-tier.
