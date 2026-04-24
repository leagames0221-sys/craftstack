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

## Follow-ups

- **Nightly GitHub Actions workflow (Session 256-B target)**. `.github/workflows/eval.yml` wires `pnpm --filter knowledge eval` into a scheduled run against the live Knowlex deploy. The workflow commits JSON reports into `docs/eval/reports/YYYY-MM-DD.json` and opens an issue on regression (pass-rate drop ≥ 5 points day-over-day). Requires a `GEMINI_API_KEY` GitHub secret; workflow ships as `workflow_dispatch` only until the secret is present, then the cron trigger is enabled in a follow-up.
- **Measured numbers on the README badge**. Once the nightly workflow has produced at least three report files, the main `README.md` gains an eval badge showing `contextPrecision / faithfulness / p95` from the latest report. Turns the `hire` → `strong hire` probe (measured eval numbers) into a repo-visible answer.
- **LLM-as-judge `--judge` flag**. Optional post-processing pass that posts answers to `gemini-2.5-pro` with a rubric prompt for true faithfulness scoring. Gated as a separate env-toggled CI job so the default eval stays zero-cost-on-free-tier.
