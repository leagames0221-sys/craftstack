# ADR-0042: Knowlex test, bench, and smoke stack after the HNSW fix

- Status: Accepted
- Date: 2026-04-24
- Tags: knowlex, testing, observability, operational

## Context

Session 252 → 253 closed out the ivfflat → HNSW migration (ADR-0041) that was blocking Knowlex's `/api/kb/ask` end-to-end path. The debug loop that got us there had three structural weaknesses, each of which made a small logic bug into a multi-hour production chase:

1. **No integration test** exercised `retrieveTopK` against a real pgvector instance, so the ivfflat/probes regression could not have been caught before deploy.
2. **No operational probe** exposed corpus counts / FK integrity / index type — every diagnostic round required editing `console.log` statements in application code and waiting for a Vercel rollout.
3. **No deploy-time smoke** confirmed that the live deployment was serving the routes we thought we'd shipped.

The `apps/collab/src/app/api/kb/ask/route.ts` handler also carried bit-rotted "diagnostic" code comments from Session 252 — `streamText` was imported-but-unreachable, with a JSDoc promise to "flip back once the root cause is pinpointed". The root cause was never pinpointed because `generateText` quietly solved the symptom. Leaving the code and comment in their half-investigated state is not acceptable for a portfolio-facing repo.

## Decision

Three net additions, one cleanup:

### 1. Integration test harness — `src/server/retrieve.integration.test.ts`

Runs against whatever PostgreSQL instance `DATABASE_URL` resolves to. Production usage is `docker compose up -d postgres` + `pnpm --filter knowledge exec prisma migrate deploy` + `pnpm --filter knowledge test:integration`. The test:

- Mocks `@/lib/gemini::embedTexts` with a deterministic seeded-vector function so no Gemini API key is required to run.
- Seeds `NUM_DOCS × CHUNKS_PER_DOC` rows directly via Prisma, bypassing `ingestDocument` so the assertions isolate the retrieve-path contract.
- Asserts three things:
  1. `retrieveTopK` populates the Chunk and Document joins and returns finite, non-negative distances.
  2. When `k ≥ corpus size`, **all** seeded rows come back — this is exactly the regression a misconfigured ivfflat(lists, probes) would silently break, and HNSW passes by construction.
  3. Querying with the same seed string used to build a stored vector ranks that chunk first with `distance ≈ 0`.

Vitest config gates integration tests behind `KNOWLEX_INTEGRATION=1` so `pnpm test` (unit) still runs without docker.

### 2. Bench script — `scripts/bench-retrieve.ts`

Idempotently seeds N=1000 random 768-dim vectors against the bench document, runs M=100 kNN queries, and reports min / p50 / p95 / p99 / max wall-clock time. Invoked via `pnpm --filter knowledge bench`; N, M, K and a `BENCH_CLEAN=1` teardown flag are env-tunable. The bench is intentionally a _script_, not a test — it prints numbers rather than asserting them so that future index-parameter comparisons don't turn into flaky test failures.

### 3. Playwright smoke — `tests/smoke/stats.spec.ts`

Runs against either the live Vercel deployment (`E2E_BASE_URL=https://craftstack-knowledge.vercel.app pnpm --filter knowledge test:e2e:smoke`) or a local dev server (default `http://localhost:3001`). Three checks:

- `/` renders the Ask UI (heading + Ask button present).
- `/kb` renders the Corpus UI.
- `/api/kb/stats` returns a well-shaped payload: non-negative counts, `orphanEmbeddings === 0`, `storedDim` matching `expectedDim (768)` when rows exist, `indexType === "hnsw"` (an accidental ivfflat downgrade would flip this and fail the smoke), and `embeddingModel === "gemini-embedding-001"`.

The `/api/kb/stats` endpoint shipped with ADR-0041; this smoke is its first programmatic consumer.

### 4. Streamtext/generateText asymmetry — documented, not undone

The Knowlex full RAG (`apps/knowledge/src/app/api/kb/ask`) uses `streamText`. The Boardly-hosted playground (`apps/collab/src/app/api/kb/ask`) uses `generateText`. We keep both as-is and retire the "flip back" comment:

- Knowlex RAG answers are short, citation-driven, and small in payload — streaming gives a perceptible UX win.
- The playground accepts up to 12 KB of pasted context and a 600-token ceiling. Under Vercel's Node runtime we observed streamed responses occasionally truncated by the platform proxy; `generateText` returns a single indivisible `text/plain` body that sidesteps the issue. The UX difference on this size class is imperceptible.

This is now described in the handler's code comment as an intentional decision, the unused `streamText` import and the unreachable-line hack are removed, and both handlers return proper JSON error codes (`RETRIEVAL_FAILED`, `GENERATION_FAILED`, `EMPTY_ANSWER`) instead of leaking `[debug]`-prefixed exception messages to callers.

## Consequences

Positive:

- The exact regression class that broke S252 is now a single `pnpm test:integration` invocation away from detection. Had this harness existed first, the ivfflat pathology would have failed CI on its introducing commit.
- Every deploy to Vercel can be gated on `pnpm --filter knowledge test:e2e:smoke` against `E2E_BASE_URL=https://craftstack-knowledge.vercel.app` before trusting the deployment — including a hard assertion that the index type hasn't silently reverted.
- Index-tuning follow-ups have a numeric baseline via the bench, instead of being argued by vibes.
- The collab handler reads as intentional code. A future contributor isn't left guessing whether the `generateText` branch was a fix or a half-finished debug.

Negative:

- Integration tests depend on docker-compose being up locally. This is a real contributor-onboarding cost compared to the pure-mock suite, but it's the only way to exercise pgvector semantics faithfully.
- The bench is a script (not a test) and so doesn't trigger on CI by default. A deliberate choice (see above) — numbers want to be monitored as a trend, not checked as a pass/fail.

## Follow-ups

- Wire `pnpm --filter knowledge test:e2e:smoke` into `.github/workflows/ci.yml` as a post-deploy gate against the live URL.
- Record a baseline `bench` run in `docs/bench/` once the corpus grows past a few thousand rows, so the HNSW-vs-tuned-HNSW decision has real numbers to anchor on.
- Extend the integration suite to cover `ingestDocument` end-to-end with a seeded `GEMINI_API_KEY` in a secrets-gated CI job, closing the last mock seam.
