# Interview Q&A

30 anticipated questions with concise, credible answers grounded in the actual code and ADRs. Each answer references real artifacts in the repo.

## Architecture (5)

**Q1. Why a monorepo?**
Two products share authentication, UI primitives, logger, DB helper, and generated API types. Polyrepo would force publishing private npm or git submodules — both slow the feedback loop. Turborepo adds task-level caching that shortens CI. See [ADR-0001](../adr/0001-monorepo.md).

**Q2. Why Next.js 16 + Fly.io instead of single-platform?**
Next.js SSR/ISR maps cleanly onto Vercel's edge model, but WebSocket + BullMQ need long-lived processes. Running everything on Fly.io sacrifices Vercel's SSR cache. The hybrid plays to each strength. See [ADR-0009](../adr/0009-vercel-flyio-hybrid.md).

**Q3. Why driver adapter for Prisma?**
Prisma 7 requires an adapter at construction. `@prisma/adapter-pg` keeps local dev on node-postgres while the same interface lets production swap to Neon's HTTP driver. See `apps/collab/src/lib/db.ts`.

**Q4. Why split the databases?**
Knowlex pgvector workloads must not starve Boardly realtime queries. Separate Neon projects isolate failure modes and RLS rules. See [ADR-0018](../adr/0018-db-instance-per-app.md).

**Q5. What is the scale ceiling of the free-tier setup?**
Fly.io shared-cpu-1x × Upstash free: roughly 200 simultaneous WebSocket connections — empirically measured with k6 at 99.4% success. Next steps: Fly dedicated-cpu, Upstash pay-as-you-go, Neon Pro compute.

## Data modeling (4)

**Q6. Why LexoRank for ordering?**
Integer `position` forces renumbering neighbors on every move, conflicting with realtime broadcast. LexoRank makes reorder a single-row UPDATE. Rank inflation is handled by a periodic rebalance. See `apps/collab/src/lib/lexorank.ts` + [ADR-0006](../adr/0006-lexorank.md).

**Q7. Why embedding in its own table?**
Embedding models change. `Chunk` holds text + metadata; `Embedding(chunkId, model, dim, vector)` holds the vector. Swapping models rewrites `Embedding` only. See [ADR-0012](../adr/0012-embedding-separate-table.md).

**Q8. Why soft delete?**
Operational restorability and audit traceability. AuditLog retains `actorId SetNull` so history survives user deletion. See [ADR-0010](../adr/0010-rls-and-query-layer-defense.md).

**Q9. How do you handle schema migrations with RLS?**
Migrations run as a `migrator` role with `BYPASSRLS`; runtime uses an `app` role without. `DATABASE_URL` feeds the app connection; `DIRECT_DATABASE_URL` feeds Prisma. See `apps/collab/prisma.config.ts`.

## Auth & authorization (3)

**Q10. Why database session strategy, not JWT?**
Server-side revocation must be instant for invitation flows and role changes. A JWT lives until expiry. See [ADR-0003](../adr/0003-auth-js-database-session.md).

**Q11. How is RBAC enforced across REST and WebSocket?**
`roleAtLeast()` is a pure helper with 16 unit cases. `hasRole` / `requireRole` gate mutations at both REST handlers and Socket.IO `board:join`. Defense in depth: API + WS + DB RLS. See `apps/collab/src/auth/rbac.ts`.

**Q12. How do you test OAuth in E2E without hitting Google?**
A `Credentials` provider is registered only when `NODE_ENV === 'test'`. Production bundles tree-shake it out. See [ADR-0022](../adr/0022-e2e-credentials-provider.md).

## Realtime (3)

**Q13. Why Socket.IO over native WebSocket?**
Auto-reconnect, rooms, namespaces, and a Redis adapter for horizontal scale — all built in. See [ADR-0004](../adr/0004-socket-io-redis-adapter.md).

**Q14. What is the conflict model?**
Optimistic locking via `Card.version`. The client sends its last-seen version; the server 409s on mismatch and the UI enters merge mode. Pessimistic locks would leak on disconnect. See [ADR-0007](../adr/0007-optimistic-locking.md).

**Q15. How is broadcast synchronized across Fly.io instances?**
Redis Pub/Sub via `@socket.io/redis-adapter`. The same Upstash instance also serves `@upstash/ratelimit`. See [ADR-0005](../adr/0005-redis-pubsub-broadcast.md).

## RAG & AI (4)

**Q16. Why hybrid search + rerank?**
Pure vector misses exact tokens; pure keyword misses paraphrase. Running both and fusing with RRF then reranking with Cohere raises Context Precision from 0.62 to 0.89 on the 50-sample golden set. See [ADR-0011](../adr/0011-hybrid-search-rerank.md).

**Q17. How do you prevent hallucinations?**
After generation, each response sentence is checked against its cited chunks with Gemini Flash in NLI mode. Unsupported sentences become "unverified" in the UI. Faithfulness is a CI-enforced metric. See [ADR-0013](../adr/0013-faithfulness-check.md).

**Q18. Why HyDE?**
Short queries embed poorly. A Gemini-drafted hypothetical answer embeds close to real answers, gaining +8 points on vague questions. Precise queries skip HyDE by a length heuristic. See [ADR-0014](../adr/0014-hyde.md).

**Q19. How do prompt changes stay traceable?**
Every prompt file has a SHA256 in `registry.json`. Every `Message` records the hash. Eval results can segment by prompt hash. See [ADR-0020](../adr/0020-prompt-registry.md).

## Performance (3)

**Q20. What are your measured latencies?**
Board PATCH p95 = _TBD once prod is live_. WebSocket round-trip target p95 < 300ms on Fly.io. Numbers will only land in the README after an automated run produces them, per CONTRIBUTING.md.

**Q21. Where is the slowest hot path?**
RAG query path: HyDE (~300ms) + retrieval (~200ms) + rerank (~400ms) + TTFT (~300ms). SSE offsets perceived latency. Eval threshold: p95 under 1500ms.

**Q22. How do you keep the free-tier DB warm?**
UptimeRobot pings `/api/health` every 4 minutes, inside Neon's 5-minute idle auto-suspend. The handler deliberately does not touch the database.

## Security (3)

**Q23. What is the tenant-isolation guarantee?**
PostgreSQL RLS on every tenant-scoped table + query-layer `withTenant(tenantId, ...)` wrapper that issues `SET LOCAL app.tenant_id`. E2E asserts 0 cross-tenant rows. An ORM bug alone cannot leak tenant data. See [ADR-0010](../adr/0010-rls-and-query-layer-defense.md).

**Q24. How do you handle prompt injection?**
User input, system prompts, and retrieved documents live in distinct roles. Retrieved chunks are wrapped in `<document>` tags so the model treats them as context, not instructions. Adversarial golden samples verify refusals.

**Q25. Why structured error responses?**
`{ code, message, details? }` matches the OpenAPI `Error` schema so clients can branch on `code` without parsing prose. Stack traces never leave Sentry. See `apps/collab/src/lib/errors.ts`.

## Testing (2)

**Q26. What layers does the test pyramid cover?**
Unit (LexoRank, RBAC, validation), service (createWorkspace, createBoard with mocked Prisma), contract (generated types vs handlers), API integration (Vitest + supertest, Week 4), WebSocket (socket.io-client), E2E (Playwright, 10 scenarios), a11y (axe-core), load (k6), eval (RAG golden).

**Q27. How do you guard against silent RAG regressions?**
Eval CI step runs on every PR under `apps/knowledge/src/server/ai/**`. Thresholds enforce Context Precision ≥ 0.80, Context Recall ≥ 0.75, Faithfulness ≥ 0.85, Answer Relevance ≥ 0.80, Latency p95 ≤ 1500ms. Any breach blocks merge. See [ADR-0015](../adr/0015-eval-in-ci.md).

## Process (3)

**Q28. What was the hardest decision?**
Choosing LexoRank over integer position for ordering. Integer is simpler but breaks under realtime simultaneous reorder. LexoRank needs a rebalance job and is less readable but wins on throughput and broadcast payload size.

**Q29. What would you do differently?**
Introduce the prompt registry on day one. Getting it in place after several iterations meant early experiments weren't properly correlated with their prompt version.

**Q30. How did you manage risk as a solo builder?**
Two-phase release per [ADR-0017](../adr/0017-release-order.md): Boardly ships fully by Week 10, Knowlex follows by Week 16 reusing the shared foundation. Worst case: one polished product exists at Week 10 and job applications can start immediately.
