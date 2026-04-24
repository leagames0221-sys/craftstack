# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows semantic-versioning-ish — `major.minor.patch` where a minor bump corresponds to a public deployable milestone.

## [Unreleased]

## [0.4.2] — 2026-04-24

### Changed — claim-reality alignment

Landed in response to the Session 255 hiring-sim run #2 verdict of `hire` (not `strong hire`). Two honesty gaps closed without schema or code churn:

- **Knowlex "multi-tenant" claim softened everywhere it is user-facing** to match ADR-0039's shipped scope (single-tenant RAG demo; workspace tenancy is the next arc). Surfaces touched: `README.md` sub-header + Apps table, `package.json` description, Boardly landing hero (`apps/collab/src/app/page.tsx`), and the playground `SAMPLE_CONTEXT` string used by `/playground` answers. The three design-phase aspirational docs (`docs/hiring/portfolio-lp.md`, `docs/design/11_hiring_materials.md`, `docs/hiring/demo-storyboard.md`) keep their design-phase copy but gain a prominent "design-phase aspirational" banner linking to ADR-0039, so reviewers opening those files know the numbers and shots are targets, not shipped state.
- **ADR-0046 § Context now names the arc as self-driven, not incident-driven.** One paragraph added before the "Three gaps:" list explaining that no Gemini key had leaked, no budget had spiked — the enforcement-loop gap was self-named via ADR-0043's own Trade-offs caveat. The regime: close the enforcement loop before an incident forces it, so the `$0/mo` guarantee survives the next unreviewed commit and the next leaked key equally. This pre-empts the interview probe "was this reactive or regime-level thinking?" by writing the answer into the repo.

No schema, no route handler, no CI workflow touched. `pnpm check:free-tier` still passes. All ten CI checks (CI / CodeQL / authed Playwright / free-tier / a11y / pgvector integration / Vercel ×3 / preview comments) green on the merge.

## [0.4.1] — 2026-04-24

### Added (post-v0.4.0)

#### Cost-safety enforcement (ADR-0046)

- **`EMERGENCY_STOP=1` kill switch** — new `apps/{collab,knowledge}/src/lib/emergency-stop.ts` wired into `/api/kb/{ask,ingest}` on both apps. When the env flag is set, those handlers short-circuit before any DB / rate-limit / Gemini work and return HTTP 503 with `{ code: "EMERGENCY_STOP" }` and `Retry-After: 3600`. Read-only observability endpoints stay live so operators can still see state during a pause. Full activate/observe/restore procedure in `docs/ops/runbook.md § 9`.
- **PR-blocking `free-tier-compliance` CI gate** — new `scripts/check-free-tier-compliance.mjs` runs as its own job in `ci.yml` (Node-only, zero deps). Blocks merges that introduce a paid-plan `vercel.json`, a billable-only SDK (`stripe`, `twilio`, `@vercel/kv`, `@vercel/postgres`, `@vercel/blob`, `@sendgrid/mail`, `mongodb-atlas`), or a real-looking secret pattern leaked into `.env.example`. Conservative blocklist — SDKs with credible CC-free tiers (Sentry, Upstash, Pusher Sandbox, Resend, AI Studio Gemini) pass. `pnpm check:free-tier` runs it locally.
- **`/api/kb/budget` observability surface** — mirrors the `/api/kb/stats` shape. Exposes both `kb-ask` and `kb-ingest` namespaces' current `{used, cap, resetInSeconds}` plus the emergency-stop flag, fed by a new read-only `snapshotBudget()` helper on `lib/global-budget.ts`. Cheap, no auth, no Gemini calls — safe for UptimeRobot and smoke tests.
- **STRIDE `C-01..C-06` rows** in `docs/security/threat-model.md` — makes free-tier bleed a first-class category alongside Spoofing / Tampering / DoS, documenting the mitigation path for each of: single-IP flood, IP rotation, Gemini key leak to a billable key, silent infra tier upgrade, slow operator response, oversize ingest.
- **Workflow-level `permissions: contents: read`** defaulted across `ci.yml`, `e2e.yml`, `smoke.yml` (CodeQL + SBOM already had explicit permissions).
- **PR-blocking a11y gate** — new `a11y-knowledge` job in `ci.yml` + second Playwright invocation in `e2e.yml`. Previously only `smoke.yml`'s 6h cron caught regressions post-merge; now `/`, `/kb`, `/docs/api` and `/`, `/signin`, `/playground` fail the PR on serious+critical WCAG 2.1 AA violations.
- **Vitest: +11 cases** — `apps/knowledge/src/lib/emergency-stop.test.ts` (env-flag semantics + 503 response shape) and `apps/knowledge/src/lib/global-budget.test.ts` (`snapshotBudget` invariants: zero-used for untouched namespace, read-only under repeated snapshot, reflects consumption after increment, reports fresh window once the day rolls over). Knowledge-app Vitest: 18 → 29.

#### Observability

- **Unified observability seam** in `apps/{collab,knowledge}/src/lib/observability.ts` — every `captureException` call now flows through a DSN-gated helper that forwards to Sentry when configured and stashes into a per-container in-memory ring buffer otherwise. Complements, not replaces, the instrumentation hooks (ADR-0044); lets reviewers prove the pipeline works without a Sentry account.
- **`/api/observability/captures`** endpoint on both apps — dumps the ring buffer as JSON. Open in dev / preview, closed in production unless `ENABLE_OBSERVABILITY_API=1`. Server-side routes (`/api/kb/ask`, `/api/kb/ingest`) and the `error.tsx` global boundaries route through this seam.
- Boardly: client-side Sentry init (`instrumentation-client.ts`) + wired `error.tsx` into the unified observability seam. Parity with Knowlex.
- Knowlex: `error.tsx` (new) + `/api/observability/captures` + `observability.ts` vitest suite (+5 unit tests).

#### Knowlex 33-second demo pipeline

- **`scripts/demo/demo-{convert,tts,compose}.mjs` generalised** via `DEMO_APP` + `DEMO_DIR` env overrides — the Boardly v0.3.0 invocation is the default, so nothing existing breaks.
- **`scripts/demo-knowlex/`** — self-contained companion directory: `narration.json` (ずんだもん, VOICEVOX speaker 3, 5 lines, base `speedScale: 1.25`), `README.md` (chars-to-duration budget table + 4-step edit checklist to avoid cue overlaps).
- **`apps/knowledge/playwright.demo.config.ts` + `tests/demo/record.spec.ts`** — 1920×1080 headed record against `https://craftstack-knowledge.vercel.app`, no auth project needed (Knowlex is public). Drives `/kb` ingest → `/` ask with streaming citations → `/api/kb/stats` → `/docs/api` scroll on a timeline that aligns with the narration cues.
- Root scripts `demo:knowlex:{record,convert,tts,compose,all}`; `cross-env` added at the repo root for env portability.
- **Loom published**: <https://www.loom.com/share/acff991e3da94d5aa4e98dcee0b100e2>. Embedded in README's 🎬 Walkthroughs section (now listing both videos) and in the `apps/collab/src/app/page.tsx` landing hero next to the Boardly button.

#### CI reliability

- **`@sentry/nextjs` version unblock** — the initial wire used `^9.0.0` which does not match any published major (latest is 10.x). Bumped to `^10.50.0` on both apps; regenerated `pnpm-lock.yaml` so every `pnpm install --frozen-lockfile` step in CI actually resolves.
- **`apps/knowledge/src/app/api/kb/stats/route.ts`** — replaced a `0n` BigInt literal that broke `tsc` under the app's compile target with a runtime `Number(count)` cast.
- **`collab-live-smoke` job** in `.github/workflows/smoke.yml` — second job alongside the Knowlex smoke, runs `apps/collab/tests/e2e/a11y.spec.ts` against `https://craftstack-collab.vercel.app` on the same 6-hour cron + push + dispatch triggers. Both Playwright jobs cache `~/.cache/ms-playwright` via `actions/cache@v4`.

#### Docs & portfolio polish

- **`docs/FREE_TIER_ONBOARDING.md`** — step-by-step signup flow for every external service the repo touches, with explicit "credit card required at signup?" / "demo-mode behaviour when unconfigured" columns. Companion to `COST_SAFETY.md` (which covers runtime abuse caps, not signup).
- **Mermaid architecture diagram** added to the top of README (2-app / 2-Neon-DB / Gemini / 4-workflow topology).
- **Stat + cross-reference sync** — landing page, OG image, README badge, tech-stack bullet, and monorepo-layout ADR count all rebased onto reality (178 Vitest, ~35 Playwright, 45 ADRs). Four new README body bullets link `ADR-0041`..`ADR-0045` directly so the entry point from README prose matches the ADR density.
- OG image tech-tag cloud gains `pgvector HNSW` so the Knowlex half of the portfolio is represented alongside Boardly-side tags like `Pusher`.
- **ADR-0045** — records the rationale for demo-mode observability + the follow-up path (capture positive signals, surface backend identity in `/api/kb/stats`).

### Follow-ups

- LLM-as-judge mode for `scripts/eval.ts` (`--judge`, env-gated).
- Secrets-gated CI job that runs the RAG eval nightly and commits reports into `docs/eval/reports/`.
- `SENTRY_AUTH_TOKEN` in CI secrets → source-map upload + webpack plugin.
- Boardly: card attachments (base64 data URL, < 256 KB).

## [0.4.0] — 2026-04-24

Release: <https://github.com/leagames0221-sys/craftstack/releases/tag/v0.4.0>

Knowlex goes URL-level live with real RAG: its own Vercel project, its own Neon Postgres with pgvector, citation-grounded Gemini 2.0 Flash answers. Comes with an integration-test / bench / live-smoke / eval quartet designed so the class of bug that blocked the 0.3.x RAG path never silently reshiped.

### Added

- **Knowlex RAG app** at <https://craftstack-knowledge.vercel.app>, own Vercel deployment against a dedicated Neon `knowlex-db` (Singapore, Free). Ingest at `/kb`, ask at `/`. Paragraph-aware 512-char chunking, 768-dim embeddings via `gemini-embedding-001` (`outputDimensionality` provider option), pgvector kNN over an **HNSW** cosine index, streamed Gemini 2.0 Flash answer with numbered citations. Separate Prisma migration chain, separate Vitest suite, separate Playwright smoke.
- **`/api/kb/stats`** — operational probe returning `{ documents, chunks, embeddings, orphanEmbeddings, storedDim, expectedDim, embeddingModel, indexType }`. Makes "why is retrieval returning 0?" a one-curl diagnosis instead of a redeploy loop.
- **Integration test harness** — `apps/knowledge/src/server/retrieve.integration.test.ts` exercises the real pgvector kNN path against a docker-compose postgres, with a mocked Gemini embedder so no API key is required. Asserts that `retrieveTopK` returns every row when `k ≥ corpus size` — the exact regression that the ivfflat path produced silently. Runs in CI via the new `knowledge-integration` job with a `pgvector/pgvector:pg16` service container.
- **Bench script** — `pnpm --filter knowledge bench` seeds N=1000 random 768-dim vectors and runs M=100 kNN probes, reporting min / p50 / p95 / p99 / max. Idempotent seed + `BENCH_CLEAN=1` teardown. Prints numbers instead of asserting them, by design.
- **Live smoke** — `.github/workflows/smoke.yml` runs a Knowlex Playwright smoke against the live Vercel URL every 6 hours (plus on workflow_dispatch and main pushes, with a 90-second sleep so Vercel has time to deploy). Asserts among other things that `indexType === "hnsw"`, so an accidental ivfflat rollback trips the workflow.
- **RAG regression eval** — `pnpm --filter knowledge eval` seeds a self-contained 3-doc / 10-question golden set (`docs/eval/golden_qa.json`), asks each question, scores `expectedSubstrings` (faithfulness proxy), `expectedDocumentTitle` (citation-coverage proxy), and `expectedRefusal` (robustness against prompt injection / out-of-corpus), and fails the script when pass rate drops below 80 % or p95 latency exceeds 8 s. `docs/eval/README.md` now accurately describes what ships vs. what's still aspirational (LLM-as-judge, multilingual).
- **Cost guards on Knowlex** — `apps/knowledge/src/lib/kb-rate-limit.ts` (per-IP sliding window) + `apps/knowledge/src/lib/global-budget.ts` (per-container day/month cap, env-tunable), wired into both `/api/kb/ask` and `/api/kb/ingest` with distinct error codes (`RATE_LIMIT_EXCEEDED`, `BUDGET_EXCEEDED_DAY`, `BUDGET_EXCEEDED_MONTH`). Parity with the Boardly-hosted playground.
- **Transactional ingest** — `ingestDocument` now wraps Document + Chunk + Embedding writes in `prisma.$transaction` so a mid-flight DB failure no longer leaves a partial corpus. Earlier JSDoc claimed this; the code didn't.
- **Unified embedder path** — `embedTexts` routes through `embedMany` for single- and multi-value calls alike, with a post-hoc `length !== 768` assert that surfaces silent dim drift at the boundary instead of downstream.
- **Knowlex Playwright config + smoke suite** — `apps/knowledge/tests/smoke/stats.spec.ts` covers `/`, `/kb`, and `/api/kb/stats` shape.
- **4 new ADRs** (ADR-0041 through ADR-0044): ivfflat → HNSW, test & observability stack, operational parity (cost + CI + eval), and OpenAPI + a11y + Sentry instrumentation for Knowlex.

### Changed

- **`docs/eval/`** — the aspirational `golden_qa.yaml` (referenced a nonexistent `run-eval.ts`, quoted thresholds the code couldn't compute) replaced with a working `golden_qa.json` and a rewritten README that calls out what's measured vs. aspirational.
- **Boardly `/api/kb/ask`** — the bit-rotted diagnostic code left over from Session 252 is retired. The unreachable `streamText` import and the `[debug]`-prefixed error strings are gone; the `generateText`-vs-`streamText` choice is now documented as intentional (12 KB context + Vercel proxy streaming edge cases) rather than half-investigated, and error paths return structured JSON codes (`EMPTY_ANSWER`, `GENERATION_FAILED`) instead of leaking exception shape.
- **Knowlex `/api/kb/ask`** — the `[debug]` prefix on 500 responses removed; failures return `{ code: "RETRIEVAL_FAILED" }`. Details stay server-side.
- **README Apps table** — Knowlex goes from "Schema ready" to "MVP live deploy"; the stack column reflects the shipped pgvector HNSW / Gemini embedder reality instead of a planned-feature list.

### Fixed

- **Knowlex kNN returning 0 rows on a non-empty corpus** — the v0.3.x Knowlex MVP shipped with an ivfflat cosine index at `lists = 100`. pgvector's default `ivfflat.probes = 1` probed 1 of 100 inverted lists per query; against a small corpus the 2 rows that actually existed were almost never in the probed list, so `ORDER BY <=> LIMIT k` silently returned `[]`. Dropped for an HNSW index (no probe cutoff, correct at any corpus size). Full diagnostic trail in [ADR-0041](docs/adr/0041-knowlex-ivfflat-to-hnsw.md).
- **`apps/knowledge/.gitignore`** was blocking `.env.example` with a `.env*` wildcard; now carves out `!.env.example` so the template ships. The template itself calls out the `prisma.config.ts` precedence trap that cost a round of debug in Session 253 (it reads `DIRECT_DATABASE_URL` before `DATABASE_URL`, so `.env`-set localhost wins over shell-set remote unless DIRECT is overridden too).

## [0.3.0] — 2026-04-23

Release: <https://github.com/leagames0221-sys/craftstack/releases/tag/v0.3.0>

### Added

- **Knowlex Playground** at `/playground` (public, no signup). Streamed Gemini 2.0 Flash answer grounded only in the pasted context, via Vercel AI SDK (`ai` + `@ai-sdk/google`), `fetch` + `ReadableStream` + `AbortController` on the client, `react-markdown` rendering. Env-guarded with a deterministic demo-mode fallback so the page works end-to-end with no `GEMINI_API_KEY` set.
- **Command palette** (`⌘K` / `Ctrl-K` / `/`): cross-workspace fuzzy search of workspaces / boards / cards plus `>`-prefix action mode. New `/api/search` route is membership-scoped at the query layer.
- **Public landing page** at `/` with hero, 8-stat grid, app cards, 10-decision drill-down, tech-stack cloud, and footer links. Replaces the previous silent redirect.
- **Dynamic Open Graph image** via Next's `ImageResponse` (edge runtime, system fonts). Slack / Twitter / LinkedIn previews render a branded card.
- **Keyboard shortcuts help** modal (`?`), plus `/` to open the palette, `Ctrl-Z` / `⌘-Z` to undo the last card move, `Ctrl-Shift-Z` / `⌘-Shift-Z` to redo.
- **Undo / redo on card moves** — bounded 25-entry LIFO stack replayed against the existing optimistic-lock `/api/cards/:id/move` endpoint.
- **OpenAPI 3.1 contract** at `apps/collab/src/openapi.ts`, served at `/api/openapi.json`, browsable in-app at `/docs/api` and externally via Swagger Editor.
- **Typed API client** generated via `openapi-typescript` into `src/openapi-types.ts` (committed).
- **axe-core** a11y smoke assertions on every public page (WCAG 2.1 AA, `serious` + `critical` gate).
- **`@next/bundle-analyzer`** wired behind `ANALYZE=true` (`pnpm analyze`).
- **CodeQL** workflow — weekly cron + per-PR, `security-extended` + `security-and-quality` packs.
- **COST_SAFETY.md** — full threat model for runaway-billing attacks (Japan cost-attack class), service-by-service free-tier caps, operator setup rules.
- **Layered invocation budget** (`lib/global-budget.ts`) on `/api/kb/ask`: per-IP + global daily/monthly. Per-user rate limits on `/api/search` (60/60s) and `/api/notifications` (30/60s).
- **15 new ADRs** (ADR-0023 through ADR-0037) covering RBAC hierarchy, optimistic locking, LexoRank, token-hashed invitations, three-layer rate limits, full-replace set semantics, cross-workspace guards, best-effort side effects, URL-as-state, env-guarded integrations, Knowlex deploy decision, a11y gating, hand-written OpenAPI, client-only undo/redo, cost hardening.
- **Issue templates** (bug / feature / security-redirect), `SECURITY.md`, `COST_SAFETY.md` cross-linked from the README.

### Changed

- **Content-Security-Policy** flipped to nonce-based with `'strict-dynamic'` via the Next 16 proxy. No `'unsafe-inline'` in `script-src`. Verified **A+** on [securityheaders.com](https://securityheaders.com/?q=https%3A%2F%2Fcraftstack-collab.vercel.app%2F&followRedirects=on).
- Added `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: same-origin`. Expanded `Permissions-Policy` to deny every unused sensor / media / power capability.
- Landing stats (Vitest / routes / ADRs) refresh to **160 / 34 / 37**.

### Fixed

- `new URL(...).pathname` no longer breaks the demo pipeline on Windows; switched to `fileURLToPath` for drive-letter-safe `path.resolve`.
- `/signin` and `/invite` now flow through the edge proxy so they receive the nonce CSP (previously the matcher skipped them, leaving them without CSP).

## [0.2.0] — 2026-04-23

Release: <https://github.com/leagames0221-sys/craftstack/releases/tag/v0.2.0>

### Added

- **Card drag-and-drop** with `@dnd-kit`, LexoRank positions, optimistic UI, and `VERSION_MISMATCH` rollback via the `version` column on Card.
- **Realtime fanout** via Pusher Channels (`board-<id>` channel). Env-guarded: missing credentials skip the broadcast with a warn.
- **Workspace invitations** — token-hashed (SHA-256 at rest), email-bound accept, Resend delivery with graceful fallback to console log when `RESEND_API_KEY` is unset.
- **Three-layer rate limit** on invitation creation: global 1000/mo, per-workspace 50/day, per-user 20/day. All env-override-able, each trip returns a distinct error code.
- **Comments** (soft-delete + moderation + 4000-char cap), **@mentions** + **Notifications bell** (30s poll), **labels** + **assignees** (full-replace set semantics with cross-workspace guards), **due dates** with overdue / due-today badges, **URL-driven label filter** (`?labels=id1,id2`), **board card search** (`?q=...`), **card-scoped activity history**, **workspace activity feed** with cursor pagination, **per-list WIP limits** (ADMIN+).
- **Playwright smoke** (11 scenarios) + **130 Vitest** unit cases.
- **Demo video pipeline** (`demo:auth` → `record` → `convert` → `tts` → `compose`). Playwright capture + VOICEVOX TTS + ffmpeg overlay. 45-second Loom walkthrough published.
- Full `How this was built` section in README with 10 architectural decisions called out.

## [0.1.0] — 2026-04-23

Release: <https://github.com/leagames0221-sys/craftstack/releases/tag/v0.1.0>

### Added

- Initial authenticated deploy at <https://craftstack-collab.vercel.app>.
- Turborepo + pnpm monorepo scaffold; two apps (`apps/collab` = Boardly, `apps/knowledge` = Knowlex schema + landing).
- Next.js 16 (App Router, Turbopack) + TypeScript 5 + Tailwind 4.
- Prisma 7 + `@prisma/adapter-pg` against Neon Postgres (Singapore).
- Auth.js v5 with JWT session strategy (OAuth via GitHub + Google); edge-runtime proxy gates page routes, Node-runtime handler mounts PrismaAdapter.
- Core Boardly CRUD: workspaces → boards → lists → cards.
- Baseline security headers (HSTS 2y preload, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).
- GitHub Actions CI (lint / typecheck / test / build).
- 22 design-phase ADRs (ADR-0001 through ADR-0022) covering the intended shape of the full system (RLS, hybrid search, RAG faithfulness, etc.).
- 50 Vitest unit cases, 3 Playwright smoke scenarios.

[Unreleased]: https://github.com/leagames0221-sys/craftstack/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/leagames0221-sys/craftstack/releases/tag/v0.3.0
[0.2.0]: https://github.com/leagames0221-sys/craftstack/releases/tag/v0.2.0
[0.1.0]: https://github.com/leagames0221-sys/craftstack/releases/tag/v0.1.0
