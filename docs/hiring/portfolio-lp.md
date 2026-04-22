# Portfolio

Two production-grade SaaS apps, designed and shipped from schema to deploy by a single developer.

> **Status (as of v0.1.0)**: Boardly is **live with authentication + CRUD** at <https://craftstack-collab.vercel.app>. Socket.IO realtime, attachments, search, notifications, and the Knowlex RAG stack are in the roadmap and are not yet measurable. Numbers quoted below are targets set in the ADRs, not current measurements.

## 🟣 Boardly — Realtime collaborative kanban

Trello's simultaneous-edit experience rebuilt with first-class permissions, audit, and accessibility.

- OAuth (Google / GitHub) with database-session strategy for instant revocation
- 4-tier RBAC (Owner / Admin / Editor / Viewer) enforced at REST and WebSocket
- Realtime via Socket.IO + Redis Pub/Sub across Fly.io instances
- Optimistic locking × LexoRank for zero-conflict reorder
- Attachments via Cloudflare R2 presigned URLs; search over `tsvector`
- Web Vitals, Sentry, Better Stack, UptimeRobot on the free tier

[Live demo](#) · [Source](https://github.com/leagames0221-sys/craftstack/tree/main/apps/collab) · [Architecture](../architecture/system-overview.md)

## 🟠 Knowlex — Multi-tenant AI knowledge SaaS

A RAG-backed Q&A product for internal documents with enterprise-grade tenant isolation.

- PostgreSQL Row-Level Security + query-layer `withTenant()` wrapper
- Hybrid retrieval: pgvector (HNSW) + BM25, fused via Reciprocal Rank Fusion
- Cohere `rerank-multilingual-v3`, cross-encoder fallback for quota resilience
- HyDE + Faithfulness check — hallucinated sentences are flagged, not hidden
- 50-sample golden QA running in CI with Context Precision ≥ 0.80 gate

[Live demo](#) · [Source](https://github.com/leagames0221-sys/craftstack/tree/main/apps/knowledge) · [Eval report](../eval/README.md)

## What this portfolio demonstrates

**Full-stack delivery from scratch.** Schema, API, realtime, UI, CI, observability — no starter template was cloned. Every subsystem is justified in [22 ADRs](../adr/).

**Production discipline.** Security headers, [STRIDE threat model](../security/threat-model.md), [incident runbook](../ops/runbook.md), [rate limits](../api/rate-limits.md), [data-retention policy](../compliance/data-retention.md). RAG quality regressions are caught by an [Eval CI gate](../adr/0015-eval-in-ci.md).

**Free-tier operations.** The entire production target is `$0/month` using Neon, Upstash, Fly.io, Vercel, Cloudflare R2, Google Gemini, Cohere trial. Every free-tier quirk is mitigated in code, not hoped around. See [ADR-0016](../adr/0016-free-tier-constraints.md).

## Stack

Next.js 16 · TypeScript · Prisma 7 · PostgreSQL 16 · pgvector · Socket.IO · Upstash Redis · Cloudflare R2 · Auth.js v5 · Gemini · Cohere Rerank · Turborepo · pnpm · Vitest · Playwright · k6 · Sentry · Better Stack · UptimeRobot · Fly.io · Vercel · Cloudflare DNS.

## Contact

- Email · leagames0221-sys@github
- GitHub · <https://github.com/leagames0221-sys>
