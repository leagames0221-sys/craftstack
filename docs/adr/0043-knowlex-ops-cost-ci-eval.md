# ADR-0043: Knowlex operational parity — cost guards, CI gates, and RAG eval

- Status: Accepted
- Date: 2026-04-24
- Tags: knowlex, security, ci, observability, rag, testing

## Context

ADR-0041 (HNSW swap) and ADR-0042 (test + smoke + bench stack) got Knowlex to a live-demoable state. Three gaps remained before it could stand next to Boardly at equivalent operational quality:

1. **No cost guards on Knowlex endpoints.** The Boardly-hosted Knowlex _playground_ (`apps/collab/src/app/api/kb/ask`) has per-IP sliding-window rate limits and a per-container daily/monthly budget guard (see `COST_SAFETY.md` + `lib/kb-rate-limit.ts` + `lib/global-budget.ts`). The full RAG app at `apps/knowledge/src/app/api/kb/{ask,ingest}` shipped with **neither**. A recruiter hitting `/kb` with a scripted loop could drain the free-tier Gemini quota, and — if `GEMINI_API_KEY` is ever rotated to a billing-enabled Google Cloud project — rack up real charges.
2. **No CI gate against the regression class we just shipped a fix for.** The Session 252 ivfflat/probes pathology is now covered by `retrieve.integration.test.ts`, but that test never runs automatically. Merging a future change that reverts to ivfflat (or forgets a migration) would ship silently. Separately, the live `/api/kb/stats` smoke (ADR-0042) had no schedule — regressions that landed between deploys went undetected.
3. **No RAG quality measurement, real or fake.** `docs/eval/` had an aspirational `golden_qa.yaml` referencing a `scripts/run-eval.ts` that didn't exist, plus unverified threshold numbers. Either make it real or take the aspirational doc out.

## Decision

### 1. Cost parity — rate limit + global budget on Knowlex

Ported `kb-rate-limit.ts` and `global-budget.ts` from `apps/collab/src/lib/` to `apps/knowledge/src/lib/` verbatim (deliberate near-copy: the modules are small, self-contained, and promoting them to `packages/` would introduce a build-graph node for no runtime benefit at portfolio scale — see ADR-0018 for the app-per-DB isolation principle this extends).

Wired both libraries into `/api/kb/ask` and `/api/kb/ingest`:

- **Per-IP** (`checkAndIncrement(ip)`) — 10 calls / 60 s per source IP. Reads `x-forwarded-for` then `x-real-ip`, falling back to `"unknown"` (which is a fine shared bucket because the unknown-IP class is almost never a legitimate browser).
- **Global budget** (`checkAndIncrementGlobalBudget("kb-ask")` / `"kb-ingest"`) — 800/day, 10000/month per warm container, `KB_BUDGET_PER_DAY` / `KB_BUDGET_PER_MONTH` env-overridable. Separate namespaces for ask vs ingest so a runaway ingest loop can't blow the ask budget and vice versa.

Both failures return HTTP 429 with `Retry-After` and distinct error codes (`RATE_LIMIT_EXCEEDED`, `BUDGET_EXCEEDED_DAY`, `BUDGET_EXCEEDED_MONTH`) so the client can render specific UX.

The rate-limit and global-budget library unit tests also ported (`kb-rate-limit.test.ts`); they pass under `pnpm --filter knowledge test` alongside the existing suite.

### 2. CI gates — integration job + scheduled live smoke

Added two workflow changes:

- **`.github/workflows/ci.yml`**: new `knowledge-integration` job. Spins up a `pgvector/pgvector:pg16` service container, creates the `knowlex` database + `vector` extension via `psql`, runs `prisma migrate deploy`, and executes `pnpm --filter knowledge test:integration`. Runs on every PR and every push to `main`. An accidental migration that rebuilt the HNSW index as ivfflat(lists=100) would fail the "returns all rows when k >= corpus size" assertion and block merge.
- **`.github/workflows/smoke.yml`**: new workflow, three triggers — `schedule` every 6 hours, `workflow_dispatch` for on-demand, and `push` on `main` (with a 90 s sleep so Vercel has time to finish deploying the branch before we smoke it). Runs `pnpm --filter knowledge test:e2e:smoke` with `E2E_BASE_URL=https://craftstack-knowledge.vercel.app`. Uploads the Playwright HTML report on failure.

Both jobs stay on the free tier: GitHub Actions is unlimited for public repos, the service container is free, and the smoke suite does no Gemini calls (it hits `/api/kb/stats` and renders the two UI pages).

### 3. RAG eval — shallow-but-working

Replaced the aspirational `docs/eval/golden_qa.yaml` with a self-contained `docs/eval/golden_qa.json` containing:

- A 3-document `corpus` (Knowlex architecture, Boardly architecture, security posture) — written to be about _this repository_ so a recruiter reading the source can verify the ground truth without external context.
- A 10-question `questions` array spanning factual, reasoning, and adversarial categories, each annotated with `expectedSubstrings` (coarse faithfulness proxy) and/or `expectedDocumentTitle` (citation-coverage proxy) or `expectedRefusal: true` for out-of-corpus / prompt-injection prompts.

Added `apps/knowledge/scripts/eval.ts`, invokable via `pnpm --filter knowledge eval`. It seeds the corpus through the real `/api/kb/ingest` endpoint, fires each question through `/api/kb/ask`, scores the answer + citations, tracks per-question latency, and exits non-zero if pass rate drops below 80 % or p95 latency exceeds 8000 ms.

**What this is not.** It is not a RAGAS-grade eval. The substring check catches the coarsest failures (wrong model name, wrong doc cited, refusal bypass) but misses subtle hallucinations. The threshold numbers in earlier docs (`contextPrecision ≥ 0.80`, `faithfulness ≥ 0.85`) are targets for a follow-up LLM-as-judge layer, not measurements of what ships today — and the eval README now says so plainly instead of letting those numbers read as claims.

## Consequences

Positive:

- Knowlex can no longer be trivially drained by a scripted loop. Both apps have the same cost-safety story documented in a single `COST_SAFETY.md`.
- Every future PR proves that the HNSW-backed retrieve path still returns rows before being mergeable. The exact regression that cost us Session 252 is now a CI failure, not a production surprise.
- Every 6 hours (plus every main-branch push) the live deployment is verified. `indexType === "hnsw"` sits in the smoke assertions, so an accidental migration rollback trips the workflow.
- The repo has a working eval with an honestly-scoped README instead of an aspirational one that promised metrics the code couldn't compute.

Negative:

- The live smoke adds ~1 minute of scheduled CI per 6-hour window. At GitHub's free-tier limits this is noise; on a private repo it counts against the 2000-min/month budget.
- The in-memory rate limiter is per-container on Vercel serverless. At portfolio traffic this is meaningfully bounded; a production deploy would migrate to Upstash-backed state. This trade-off is accepted under `COST_SAFETY.md`'s "free-tier first" principle.
- `eval.ts` requires a running Knowlex deployment with `GEMINI_API_KEY` configured, so it cannot be part of default PR CI without a secrets-gated job. Left as a local/nightly invocation until that gate is wired.

## Follow-ups

- Wire `eval` into a scheduled workflow once a secrets-gated `GEMINI_API_KEY` is configured at the GitHub Actions level; commit per-run reports into `docs/eval/reports/YYYY-MM-DD.json` for trend visualisation.
- Add an LLM-as-judge mode to `eval.ts` (`--judge`) that scores faithfulness via `gemini-2.5-pro`, gated on a separate env variable so default runs stay zero-cost.
- Promote `kb-rate-limit` and `global-budget` to `packages/` once a third caller appears; today they are app-scoped copies by design.
