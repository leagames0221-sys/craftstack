# Portfolio

Two production-grade SaaS apps, designed and shipped from schema to deploy by a single developer. Currently at **v0.5.9** with measured production reliability — not aspirational targets.

> **Status (as of v0.5.9, 2026-04-28)**: Both apps are live with full feature sets. Boardly serves authenticated dashboard + workspaces + boards + DnD + Pusher realtime + invitations + mentions + notifications + command palette + activity log. Knowlex serves end-to-end RAG (ingest → HNSW kNN → streamed citations) with workspace schema partitioning per [ADR-0047](../adr/0047-knowlex-workspace-tenancy-plan.md) (auth-gated access control deferred once Auth.js lands on Knowlex). Numbers below are real: **57 ADRs** documenting actual decisions, **216 Vitest + 24 Playwright** + integration + a11y + nightly eval cron with green-run report auto-commit (v0.5.3 ship) + runtime schema canary at `/api/health/schema` (v0.5.4, ADR-0053), **$0/mo infra** under CI-enforced free-tier compliance per [ADR-0046](../adr/0046-zero-cost-by-construction.md). The README's measured-eval badge sources from `docs/eval/badge.json` regenerated on every green eval run. Framework foundation enforced via repository ruleset per [ADR-0058](../adr/0058-branch-protection-ci-enforcement.md) — admin-bypass disabled, force-push blocked, 7 PR-time CI checks required.

## 🟣 Boardly — Realtime collaborative kanban

Trello-style simultaneous-edit experience with first-class permissions, audit, and accessibility. Live at <https://craftstack-collab.vercel.app>.

- OAuth (Google / GitHub) with Auth.js v5 JWT session strategy
- 4-tier RBAC (Owner / Admin / Editor / Viewer) — `roleAtLeast()` pure helper with a 4×4 = 16-case Vitest matrix, enforced at every REST handler per [ADR-0023](../adr/0023-four-tier-rbac.md)
- Realtime via **Pusher Channels** with env-guarded degradation per [ADR-0030](../adr/0030-best-effort-side-effects.md) / [ADR-0032](../adr/0032-mention-resolution-and-env-guarded-integrations.md) (missing credentials = silent skip, no breakage). Implementation pivoted from the design-phase Fly.io + Socket.IO plan ([ADR-0009](../adr/0009-vercel-flyio-hybrid.md)) for ADR-0046 compliance — see ADR-0052 for the rationale
- Optimistic locking via `version` column + LexoRank positions for zero-conflict reorder per [ADR-0007](../adr/0007-optimistic-locking.md) / [ADR-0024](../adr/0024-optimistic-locking-version-column.md) / [ADR-0048](../adr/0048-undo-redo-optimistic-lock-semantics.md)
- Token-hashed, email-bound, 3-layer rate-limited invitations per [ADR-0026](../adr/0026-token-hashed-invitations.md) / [ADR-0027](../adr/0027-three-layer-invitation-rate-limit.md)
- @mention notifications + bell + ⌘K command palette + WIP limits + labels + assignees + activity log + undo/redo

[Live demo](https://craftstack-collab.vercel.app) · [Source](https://github.com/leagames0221-sys/craftstack/tree/main/apps/collab) · [45 s walkthrough](https://www.loom.com/share/1f6915e588cb4176bfc8272f0f9310bb)

## 🟠 Knowlex — Single-tenant RAG demo

Live at <https://craftstack-knowledge.vercel.app>. Workspace schema partitioning shipped per [ADR-0047](../adr/0047-knowlex-workspace-tenancy-plan.md) partial in v0.5.0; access control deferred to v0.5.4 once Auth.js lands.

- Paste text at `/kb` → paragraph-aware 512-char chunking → `gemini-embedding-001` at 768 dim (via `outputDimensionality`) → pgvector **HNSW cosine** index per [ADR-0041](../adr/0041-knowlex-ivfflat-to-hnsw.md) (replaced ivfflat after a silent-zero-rows pathology at corpus=2)
- Ask at `/` → cosine kNN retrieval → streamed Gemini 2.0 Flash answer with numbered citations per [ADR-0039](../adr/0039-knowlex-mvp-scope.md) (MVP scope)
- Live measurement infrastructure: nightly eval cron with v4 OR-mode scoring (21 OR + 6 AND proper-noun + 3 adversarial questions) per [ADR-0049 § 7th arc](../adr/0049-rag-eval-client-retry-contract.md)
- Schema-vs-prod drift fix shipped in v0.5.2 (`vercel-build` migration regime per [ADR-0051](../adr/0051-prisma-migrate-on-vercel-build.md)); drift-detect-v2 via `pg_catalog` assertion gates PRs

> ⚠️ **Design-phase ambitions deferred**: hybrid retrieval (BM25 + vector via RRF) per ADR-0011, Cohere Rerank per ADR-0011, HyDE per ADR-0014, NLI Faithfulness check per ADR-0013, RLS per ADR-0010 — all explicitly scoped out by ADR-0039 (MVP). They remain on the roadmap. Pure cosine kNN is what ships.

[Live demo](https://craftstack-knowledge.vercel.app) · [Source](https://github.com/leagames0221-sys/craftstack/tree/main/apps/knowledge) · [33 s walkthrough](https://www.loom.com/share/acff991e3da94d5aa4e98dcee0b100e2) · [Eval reports](../eval/README.md)

## What this portfolio demonstrates

**Audit-survivable engineering.** **57 ADRs** documenting every consequential decision in MADR format. Incident-driven ratchet log: [ADR-0046](../adr/0046-zero-cost-by-construction.md) (zero-cost stance), [ADR-0049](../adr/0049-rag-eval-client-retry-contract.md) (7-arc eval reliability incident log), [ADR-0050](../adr/0050-knowlex-ingest-deduplication.md) (ingest dedup), [ADR-0051](../adr/0051-prisma-migrate-on-vercel-build.md) (schema-vs-prod drift forensic + axis-4 audit category mistake retracted in writing), [ADR-0057](../adr/0057-drift-framework-completeness.md) (13-axis drift-audit framework — 10 structural + 3 honest-disclose; axis 7 coverage scope explicitly named in the ADR), [ADR-0058](../adr/0058-branch-protection-ci-enforcement.md) (framework foundation closed — repository ruleset, admin-bypass off). Decisions get superseded explicitly, never silently rewritten.

**Implementation discipline.** Pivoted from [ADR-0009](../adr/0009-vercel-flyio-hybrid.md) (Vercel + Fly.io hybrid) to Pusher Channels during Boardly v0.1.0 implementation. Reason: ADR-0046 mandate (zero-cost-by-construction) + single-pipeline simplicity + env-guarded degradation pattern. ADR-0009 marked Superseded by ADR-0052 which records the implementation-time pivot rationale.

**Free-tier operations, $0/mo by construction, CI-enforced.** [`scripts/check-free-tier-compliance.mjs`](../../scripts/check-free-tier-compliance.mjs) runs as a PR-blocking `free-tier-compliance` gate; introducing paid-plan `vercel.json`, billable SDKs, or leaked secret patterns fails the merge. `EMERGENCY_STOP=1` env flag short-circuits every write + AI endpoint per [ADR-0046](../adr/0046-zero-cost-by-construction.md). STRIDE threat model covers the cost-attack class as `C-01..C-06`.

**Test discipline by surface.** 166 Vitest in collab + 50 in knowledge = **216 unit cases**, **24 Playwright** (smoke / authed E2E across board/dashboard/rate-limits/workspace / a11y + authed-a11y / signin), Knowlex retrieve integration test against real `pgvector` service container, axe-core a11y gate as PR-blocking on every public + authenticated page, nightly RAG eval cron with v4 substring-OR + AND-proper-noun + adversarial scoring + runtime schema canary `/api/health/schema` asserted by smoke (ADR-0053).

## Stack (as actually deployed)

Next.js 16 · TypeScript 5 · Prisma 7 + `@prisma/adapter-pg` · PostgreSQL 16 + pgvector (HNSW) on Neon Singapore · **Pusher Channels** (Sandbox tier, env-guarded) · Upstash Redis (Tokyo, rate-limit only) · Resend (email, env-guarded) · Auth.js v5 (JWT) · Gemini AI Studio (`embedding-001` + `2.0-flash`) · Turborepo · pnpm · Vitest · Playwright · k6 (scaffold per [ADR-0009 superseded note](../adr/0009-vercel-flyio-hybrid.md)) · Sentry (env-guarded with in-memory fallback per [ADR-0045](../adr/0045-observability-demo-mode.md)) · Vercel Hobby.

## How to evaluate this in 10 minutes

0. **Single-curl audit probe** (recommended first step, [ADR-0056](../adr/0056-attestation-endpoint.md)): `curl https://craftstack-knowledge.vercel.app/api/attestation | jq` returns the full audit payload — `tag`, `commit`, `buildAt`, `claims.adrCount`, `measurements.lastEvalRun`, `measurements.daysSinceLastGreenRun`, `measurements.cronHealthHint`, `runtime.schema.drift`, `runtime.corpus.indexType`, `scope.deferred`, `scope.honestScopeNotes`. Replaces the typical 8-fetch reviewer cross-check (gh api + git log + 4 markdown reads + 3 endpoint curls) with one URL.
1. **Live probes** (deeper): `curl /api/kb/stats` returns `indexType: "hnsw"`, `storedDim: 768`. `curl /api/health/schema` ([ADR-0053](../adr/0053-runtime-schema-canary.md)) returns `drift: false` + `latestMigration` for the live db. Then ingest at `/api/kb/ingest`, ask at `/`. The `/status` page on Boardly shows env-presence health for every optional service.
2. **Recommended ADRs to read first** (each tells a complete incident → fix → ratchet story): [0046](../adr/0046-zero-cost-by-construction.md) (zero-cost stance) → [0049](../adr/0049-rag-eval-client-retry-contract.md) (8-arc eval reliability incident log) → [0051](../adr/0051-prisma-migrate-on-vercel-build.md) (schema-vs-prod drift forensic + axis-4 audit category mistake) → [0053](../adr/0053-runtime-schema-canary.md) (runtime canary closing ADR-0051's runtime side) → [0054](../adr/0054-doc-drift-detect-ci-gate.md) (doc-drift-detect PR-time gate) → [0040](../adr/0040-csp-rollback-to-static-unsafe-inline.md) (CSP rollback honesty, A+ → A).
3. **Measured eval**: see [`docs/eval/`](../eval/) for golden corpus + per-cron-run reports + [`run-8-walkthrough.md`](../eval/run-8-walkthrough.md) for the per-failure analysis.
4. **Demo videos**: [45 s Boardly](https://www.loom.com/share/1f6915e588cb4176bfc8272f0f9310bb) + [33 s Knowlex](https://www.loom.com/share/acff991e3da94d5aa4e98dcee0b100e2) narrated walkthroughs.

## Contact

GitHub · <https://github.com/leagames0221-sys>
