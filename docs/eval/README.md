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
- **Context precision / recall over multi-chunk corpora.** Today the golden set has 3 hand-written documents; precision/recall only stops being trivial once the corpus is large enough for retrieval to make real ranking calls.
- **Multilingual evaluation.** Corpus is English-only. The `expectedSubstrings` check would need per-locale transforms.

Numbers from earlier ADRs that reference `contextPrecision ≥ 0.80` and `faithfulness ≥ 0.85` are **targets for the deeper harness**, not the substring check shipped today.

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

- Wire `pnpm --filter knowledge eval` into a nightly GitHub Actions workflow against the live deploy; alert on regressions.
- Commit JSON reports into `docs/eval/reports/YYYY-MM-DD.json` from the nightly run so trend visualisation becomes possible.
- Add an optional `--judge` flag that posts answers to `gemini-2.5-pro` with a rubric prompt for true faithfulness scoring, and makes the flag a separate env-gated CI job so the default eval stays zero-cost-on-free-tier.
