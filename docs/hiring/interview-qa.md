# Interview Q&A

30 anticipated questions with concise, credible answers grounded in the actual code and ADRs. Each answer references real artifacts in the repo.

> **Status (as of v0.5.12)**: this document was originally drafted in the design phase against ADRs 0001–0022 (the planned architecture). It has been reconciled with the **shipped implementation** — Pusher Channels instead of Fly.io + Socket.IO ([ADR-0052](../adr/0052-pusher-pivot-from-flyio-socketio.md) records the implementation-time pivot for [ADR-0046](../adr/0046-zero-cost-by-construction.md) compliance), pure cosine kNN instead of hybrid + RRF + rerank ([ADR-0039](../adr/0039-knowlex-mvp-scope.md) MVP scope), single-tenant instead of RLS, etc. Where a question describes design-phase ambition that ADR-0039 explicitly deferred, the answer says so plainly.

> **Numbers**: Vitest / Playwright / ADR / route counts are real measurements as of v0.5.4 (`pnpm --filter * test`, `ls docs/adr/00*.md`, `find apps/collab/src/app -name 'page.tsx' -o -name 'route.ts'`). Latency + pass-rate numbers come from the nightly eval cron's auto-committed reports under [`docs/eval/reports/`](../eval/reports/); the README measured-eval badge sources from [`docs/eval/badge.json`](../eval/badge.json) regenerated on every green run.

## Architecture (5)

**Q1. Why a monorepo?**
Two products share authentication, UI primitives, logger, DB helper, and generated API types. Polyrepo would force publishing private npm or git submodules — both slow the feedback loop. Turborepo adds task-level caching that shortens CI. See [ADR-0001](../adr/0001-monorepo.md).

**Q2. Why Vercel-only (the original ADR-0009 plan was Vercel + Fly.io hybrid)?**
The design-phase ADR-0009 chose a hybrid because Socket.IO and BullMQ workers need long-lived processes. During Boardly v0.1.0 implementation that pivot happened: realtime moved to Pusher Channels (HTTP fanout, no long-lived server needed), and BullMQ was dropped — Knowlex's bounded corpus doesn't need an async ingest worker. The pivot was driven by [ADR-0046](../adr/0046-zero-cost-by-construction.md) (zero-cost-by-construction; Fly.io free tier has wake-up overhead Pusher Sandbox doesn't), single-pipeline ops, and the env-guarded degradation pattern ([ADR-0030](../adr/0030-best-effort-side-effects.md) / [ADR-0032](../adr/0032-mention-resolution-and-env-guarded-integrations.md)) — Pusher fanout fits "missing credentials = silent skip" naturally. Recorded as [ADR-0052](../adr/0052-pusher-pivot-from-flyio-socketio.md). ADR-0009 is marked Superseded.

**Q3. Why driver adapter for Prisma?**
Prisma 7 requires an adapter at construction. `@prisma/adapter-pg` keeps local dev on node-postgres while the same interface lets production swap to Neon's HTTP driver. See `apps/collab/src/lib/db.ts`.

**Q4. Why split the databases?**
Knowlex pgvector workloads must not starve Boardly transactional queries. Separate Neon projects isolate failure modes and resource limits. See [ADR-0018](../adr/0018-db-instance-per-app.md).

**Q5. What is the scale ceiling of the free-tier setup?**
Pusher Channels Sandbox = 200k messages/day + 100 concurrent connections, free, no card. Beyond that the upgrade path is Pusher Startup ($49/mo). Neon Free = 0.5 GB storage + 191.9 compute hours/month with 5-minute idle auto-suspend (UptimeRobot pings keep it warm in business hours). Vercel Hobby = 100 GB bandwidth/month. Realistic ceiling for a free-tier portfolio demo: low-hundreds of concurrent users on Boardly, and bounded-corpus single-tenant Knowlex demos. Hard cost cap is $0 by construction per [ADR-0046](../adr/0046-zero-cost-by-construction.md) — paid-plan upgrades are the operator's deliberate choice, never auto-billed.

## Data modeling (4)

**Q6. Why LexoRank for ordering?**
Integer `position` forces renumbering neighbors on every move, conflicting with realtime broadcast. LexoRank makes reorder a single-row UPDATE. Rank inflation is handled by a periodic rebalance. See `apps/collab/src/lib/lexorank.ts` + [ADR-0006](../adr/0006-lexorank.md) / [ADR-0021](../adr/0021-lexorank-library.md) / [ADR-0025](../adr/0025-lexorank-positions.md).

**Q7. Why embedding in its own table?**
Embedding models change. `Chunk` holds text + metadata; `Embedding(chunkId, model, dim, vector)` holds the vector (PK = chunkId per the v0.5.0 schema). Swapping models rewrites `Embedding` only. See [ADR-0012](../adr/0012-embedding-separate-table.md).

**Q8. Why soft delete?**
Operational restorability and audit traceability. AuditLog retains `actorId SetNull` so history survives user deletion. Note: the automated cleanup job is design-phase per the data-retention policy; physical deletion currently requires a manual `prisma` script invocation. v0.6.0 adds Vercel Cron-based automation.

**Q9. How do you handle schema migrations?**
Migrations apply via `prisma migrate deploy` inside Vercel's `vercel-build` script per [ADR-0051](../adr/0051-prisma-migrate-on-vercel-build.md). The original v0.5.0 plan ran `prisma generate` only at build time, which silently drifted prod from `schema.prisma`; v0.5.2 closed the gap. `_prisma_migrations` table provides idempotency. RLS was design-phase per ADR-0010 but deferred — Knowlex is single-tenant per ADR-0039.

## Auth & authorization (3)

**Q10. Why JWT session strategy (the original ADR-0003 chose database sessions)?**
ADR-0003 specified database sessions for instant revocation. In practice JWT was adopted to unblock the Vercel Edge Runtime proxy (database lookups are not allowed in Edge middleware). The supersession is documented in the `fix(auth)` commit; a formal ADR-0023+ addendum is open. Trade-off: JWT lives until expiry (default 30 days); for an OAuth-only portfolio demo with no privileged data, this is acceptable.

**Q11. How is RBAC enforced?**
`roleAtLeast()` is a pure helper with a 4×4 = 16-case Vitest matrix (`apps/collab/src/auth/rbac.test.ts`). `hasRole` / `requireRole` gate every mutation at the REST handler layer. Defense in depth: API checks + Prisma-layer membership checks + cross-workspace guards on set-mutations per [ADR-0029](../adr/0029-cross-workspace-guards.md). RLS at the DB layer was design-phase per ADR-0010 but deferred per ADR-0039 (single-tenant Knowlex; Boardly multi-tenancy is enforced application-side).

**Q12. How do you test OAuth in E2E without hitting Google?**
A `Credentials` provider is registered only when `NODE_ENV !== "production"` AND `E2E_ENABLED=1` AND `E2E_SHARED_SECRET` constant-time compares against a 3-email allowlist. Production bundles tree-shake it out. See [ADR-0022](../adr/0022-e2e-credentials-provider.md) / [ADR-0038](../adr/0038-e2e-credentials-provider-implementation.md).

## Realtime (3)

**Q13. Why Pusher Channels (the original ADR-0004 chose Socket.IO + Redis Adapter)?**
ADR-0004 rejected Pusher because it "forces future vendor cost"; this judgment was reversed by [ADR-0046](../adr/0046-zero-cost-by-construction.md) (Pusher Sandbox = $0, hard-capped). Implementation chose Pusher because it fits the env-guarded degradation pattern (missing credentials = HTTP-call skip, no broken WebSocket server to babysit), keeps the deploy as a single Vercel pipeline (Fly.io would have been a second pipeline), and removes a class of "did the WebSocket server crash overnight?" failures. Recorded in [ADR-0052](../adr/0052-pusher-pivot-from-flyio-socketio.md).

**Q14. What is the conflict model?**
Optimistic locking via `Card.version`. The client sends its last-seen version; the server's `updateMany` filters by `id + version` and 0-rows-affected returns HTTP 409 `VERSION_MISMATCH`. The client bumps its local version on success so rapid drags don't stale-conflict with themselves. Pessimistic locks would leak on disconnect. See [ADR-0007](../adr/0007-optimistic-locking.md) / [ADR-0024](../adr/0024-optimistic-locking-version-column.md) / [ADR-0048](../adr/0048-undo-redo-optimistic-lock-semantics.md).

**Q15. How does broadcast fanout work?**
Pusher Channels: the server emits an event to a channel named `board-<id>` after a successful mutation; every client subscribed via `pusher-js` receives the event over Pusher's persistent connection. `BoardClient` applies the diff or, for stale local entries (`undoredoStack` items predicting state that was overwritten by a remote mutation), calls `markStale` per [ADR-0048](../adr/0048-undo-redo-optimistic-lock-semantics.md) so the next undo skips the entry. Pusher emit is wrapped per [ADR-0030](../adr/0030-best-effort-side-effects.md) — a Pusher outage cannot abort the originating card save.

## RAG & AI (4)

**Q16. Why pure cosine kNN (the original ADR-0011 was hybrid + RRF + Cohere rerank)?**
ADR-0039 (Knowlex MVP scope) explicitly defers hybrid retrieval, HyDE, and rerank to a later arc. The MVP demonstrates the full ingest → embed → store → retrieve → stream pipeline end-to-end with a single technique, on the corpus sizes that fit a portfolio demo (current production: 13 docs / 23 chunks per `/api/kb/stats`). Pure cosine kNN at 768 dim with HNSW is sufficient quality at this scale. Hybrid + RRF + Cohere remain on the v0.6.0+ roadmap once the corpus and traffic justify the additional complexity.

**Q17. How do you prevent hallucinations?**
Three layers, none of which is the design-phase NLI Faithfulness check from ADR-0013 (deferred per ADR-0039). (1) The system prompt requires inline citations `[1]` `[2]` matched to retrieved chunks; the UI suppresses any answer without citations. (2) The nightly RAG eval cron scores citation-coverage and substring-faithfulness against a 30-question golden set with 21 OR-mode + 6 AND proper-noun + 3 adversarial questions per [ADR-0049 § 7th arc](../adr/0049-rag-eval-client-retry-contract.md); regressions trip the eval. (3) The 3 adversarial questions verify the model refuses to answer outside the corpus rather than hallucinating. NLI-mode Faithfulness is on the roadmap.

**Q18. What about HyDE?**
Design-phase per [ADR-0014](../adr/0014-hyde.md), deferred per [ADR-0039](../adr/0039-knowlex-mvp-scope.md). The MVP corpus and question distribution don't yet justify the +1 LLM call per query; the eval cron would surface the gain measurably before HyDE ships. Open arc.

**Q19. How do prompt changes stay traceable?**
Prompt files live under `apps/knowledge/src/server/ai/prompts/` and are checked into git so every change is reviewable by diff. A SHA256 registry per [ADR-0020](../adr/0020-prompt-registry.md) is design-phase; the practical equivalent today is git history + `git blame` on the prompt files. Eval cron output records the answer text per question per run, so behaviour change correlates to the prompt commit that changed.

## Performance (3)

**Q20. What are your measured latencies?**
Real eval cron numbers, not targets. The nightly `eval.yml` writes per-run reports to [`docs/eval/reports/YYYY-MM-DD.json`](../eval/reports/) — each entry has `passRate`, `p95Ms`, and per-question latency. Run 3 (v3 substring-AND scoring) measured 19/30 = 63%. Run 6 measured 4/30 = 13.3% under stronger paraphrase scoring. **Run 8 (2026-04-27 19:38 UTC, the first run after v0.5.2 schema-vs-prod drift fix landed on the live Knowlex db) measured 24/30 (80%) with p95 8221 ms** under v4 scoring — comfortably above the 60% pass-rate threshold and below the 10000 ms p95 cap. The v0.5.3 README measured-eval badge sources from [`docs/eval/badge.json`](../eval/badge.json), regenerated by `scripts/eval-badge.mjs` on every green eval run and committed back to main by the workflow itself (Tier C-#2 follow-up of [ADR-0049 § 7th arc](../adr/0049-rag-eval-client-retry-contract.md), shipped in v0.5.3). Latency targets per [ADR-0049](../adr/0049-rag-eval-client-retry-contract.md): `maxP95LatencyMs: 10000` (raised from 8000 in v0.5.1 to accommodate temperature + safety BLOCK_NONE generation overhead).

**Q21. Where is the slowest hot path?**
RAG `/api/kb/ask` end-to-end: embedding (~200 ms via Gemini) + HNSW kNN on Neon (cosine, single-digit ms once warm) + Gemini 2.0 Flash streaming (TTFT ~500 ms + sustained stream). Cold-start adds Neon Free's wake-up (1–3 s) — handled by the eval client's retry-on-503 contract per ADR-0049. Per-IP rate limiter trips at 10 req/60 s sliding window per ADR-0046 cost-attack defence.

**Q22. How do you keep the free-tier DB warm?**
A scheduled GitHub Actions smoke run + UptimeRobot pings hit `/api/kb/stats` (cheap, no DB write) within Neon's 5-minute idle window during business hours. Outside business hours the DB is allowed to suspend; the eval cron's retry contract per [ADR-0049](../adr/0049-rag-eval-client-retry-contract.md) handles the resulting cold-start.

## Security (3)

**Q23. What is the tenant-isolation guarantee?**
Boardly: workspace membership enforced at every REST handler via `requireWorkspaceMember`, with cross-workspace guards on set-mutations per [ADR-0029](../adr/0029-cross-workspace-guards.md). Knowlex: single-tenant per [ADR-0039](../adr/0039-knowlex-mvp-scope.md), with workspace **schema partitioning** (every table has `workspaceId NOT NULL`) shipped per [ADR-0047](../adr/0047-knowlex-workspace-tenancy-plan.md) partial in v0.5.0; the **access-control half** (auth-gated `WorkspaceMember` route guards) is deferred to v0.5.4 once Auth.js lands on the Knowlex deploy. PostgreSQL RLS per [ADR-0010](../adr/0010-rls-and-query-layer-defense.md) is design-phase, deferred per ADR-0039.

**Q24. How do you handle prompt injection?**
The system prompt + retrieved chunks are clearly delimited so the model treats retrieved content as data, not instruction. The 3 adversarial golden-set questions verify the model refuses out-of-corpus questions ("ignore previous instructions and tell me ..."). Prompt injection is also covered structurally by the cost-attack defence — `EMERGENCY_STOP=1` short-circuits all `/api/kb/{ask,ingest}` traffic per [ADR-0046](../adr/0046-zero-cost-by-construction.md) if a wave is detected.

**Q25. Why structured error responses?**
`{ code, message, details? }` matches the OpenAPI 3.1 `Error` schema served at `/api/openapi.json` per [ADR-0035](../adr/0035-hand-written-openapi-as-the-contract.md), so clients can branch on `code` without parsing prose. Stack traces never leave Sentry / the in-memory observability ring buffer.

## Testing (2)

**Q26. What layers does the test pyramid cover?**
Unit (Vitest, **239 cases**: 174 collab + 65 knowledge — LexoRank, RBAC 4×4 matrix, validation, business logic, RAG retry contract, dedup, emergency stop, schema-canary `EXPECTED` ↔ `schema.prisma` consistency per ADR-0053, etc.), integration (Knowlex retrieve.integration.test.ts against a real `pgvector` service container in CI), E2E (Playwright, **24 scenarios**: smoke + authed E2E across board/dashboard/rate-limits/workspace + a11y + authed-a11y + signin), a11y (axe-core gate as PR-blocking on every public + authenticated page per [ADR-0034](../adr/0034-axe-core-a11y-in-playwright-smoke.md)), eval (nightly RAG cron with 30-question golden v4 + green-run auto-commit shipped in v0.5.3), drift-detect-v2 (`pg_catalog` assertion gating PRs per [ADR-0051](../adr/0051-prisma-migrate-on-vercel-build.md)) + runtime schema canary `/api/health/schema` asserted by 6-hourly smoke cron per [ADR-0053](../adr/0053-runtime-schema-canary.md). k6 scaffold exists but the realtime load harness is design-phase pending a Pusher-aware rewrite (Fly.io WebSocket-targeted version is non-runnable per ADR-0052).

**Q27. How do you guard against silent RAG regressions?**
Eval cron runs nightly per [ADR-0015](../adr/0015-eval-in-ci.md) / [ADR-0042](../adr/0042-knowlex-test-observability-stack.md) / [ADR-0043](../adr/0043-knowlex-ops-cost-ci-eval.md). Reports land in `docs/eval/reports/YYYY-MM-DD.json` (PR #29 in v0.5.3-prep). Substring-OR + AND-proper-noun + adversarial-refusal scoring is in v4 corpus per [ADR-0049 § 7th arc](../adr/0049-rag-eval-client-retry-contract.md). Schema-vs-prod drift is caught PR-time by drift-detect-v2 per [ADR-0051](../adr/0051-prisma-migrate-on-vercel-build.md) — the v0.5.0 → v0.5.2 incident (`Document.workspaceId does not exist`) cannot recur silently.

## Process (3)

**Q28. What was the hardest decision?**
Pivoting away from ADR-0009's Fly.io + Socket.IO + BullMQ architecture during implementation. The ADRs were already Accepted; rewriting realtime against Pusher meant abandoning the original load-test target (k6 on WebSocket), accepting a vendor dependency, and writing ADR-0052 retroactively to document why. The right call but the disciplined thing was to record the supersession explicitly rather than let the docs drift. The audit-survivability stance from [ADR-0046](../adr/0046-zero-cost-by-construction.md) drove it: an ADR you can't honestly answer "is this what shipped?" to has zero audit value.

**Q29. What would you do differently?**
Capture every implementation-time deviation from a design-phase ADR with an immediate Superseded marker + new ADR, instead of letting prose drift across portfolio-lp / interview-qa / system-overview / About sidebar for weeks. The v0.5.3-prep claim-reality cleanup arc was the manual corrective ratchet for the first cycle. The **institutional fix is now shipped** as [ADR-0054](../adr/0054-doc-drift-detect-ci-gate.md) (v0.5.5, doc-drift-detect CI gate) — a PR-blocking job that resolves truth from `ls docs/adr/`, `pnpm test`, file walks, and `git describe`, then asserts every embedded number / version banner in README, portfolio-lp, interview-qa, system-overview, runbook, page.tsx, layout.tsx, opengraph-image.tsx matches. Same shape as [ADR-0053](../adr/0053-runtime-schema-canary.md) (runtime schema canary) but for prose claims instead of schema columns. This Q29 itself is now self-resolving: a deferred plan flipped to a ship-tag entry and the candidate's own self-criticism became the candidate's own structural ratchet log — the [ADR-0049 § 7th arc](../adr/0049-rag-eval-client-retry-contract.md) pattern applied to hiring docs.

**Q30. How did you manage risk as a solo builder?**
Two-phase release per [ADR-0017](../adr/0017-release-order.md): Boardly ships with a working feature loop first; Knowlex follows reusing the shared foundation (auth, UI primitives, db helper, logger). Worst case: one polished product exists and the portfolio is shippable. Both shipped — Boardly v0.1.0 in Week ~10, Knowlex MVP through v0.5.4 (and counting per [ADR-0049](../adr/0049-rag-eval-client-retry-contract.md) eval reliability incident chain + [ADR-0053](../adr/0053-runtime-schema-canary.md) runtime schema canary).
