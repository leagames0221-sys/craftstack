# craftstack

[![CI](https://github.com/leagames0221-sys/craftstack/actions/workflows/ci.yml/badge.svg)](https://github.com/leagames0221-sys/craftstack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20-brightgreen)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220)](./package.json)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org)

> Full-stack portfolio monorepo — **Boardly** (realtime collaborative kanban with drag-and-drop) + **Knowlex** (multi-tenant AI knowledge SaaS).

Two production-grade SaaS applications designed and built from schema to deploy, as a solo developer, to demonstrate full-stack × from-scratch engineering capability.

## 🌐 Live demo

**Boardly**: <https://craftstack-collab.vercel.app>

Sign in to reach the authenticated dashboard. Workspace + board creation flows are wired end-to-end against Neon Postgres (Singapore) and Upstash Redis (Tokyo).

> **Reviewers**: **Continue with GitHub** is the recommended button — it works for any GitHub account out of the box. The Google OAuth app is still in Google's "Testing" status, so Google sign-in will only succeed for email addresses already registered as test users inside the Google Cloud consent screen. Publishing the Google app requires verification review and is deferred until the app is feature-complete.

Invitations, attachments, and the Knowlex RAG experience land in later milestones — see the roadmap below.

## Apps

| App                           | Description                                                 | Tech highlights                                                                                             | Status               |
| ----------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| [**Boardly**](apps/collab)    | Collaborative kanban with drag-and-drop and realtime fanout | Next.js 16 · Auth.js v5 · Prisma 7 · PostgreSQL · LexoRank · Optimistic lock · `@dnd-kit` · Pusher Channels | v0.1.0 — live deploy |
| [**Knowlex**](apps/knowledge) | Multi-tenant AI knowledge retrieval SaaS                    | Next.js 16 · pgvector · BullMQ · Gemini API · Cohere Rerank · RLS · HyDE · Faithfulness check (all planned) | Schema ready         |

## Monorepo layout

```
craftstack/
├── apps/
│   ├── collab/              # Boardly
│   └── knowledge/           # Knowlex
├── packages/
│   ├── ui/                  # shadcn/ui based shared components
│   ├── auth/                # Auth.js v5 wrapper
│   ├── db/                  # Prisma client + withTenant() helper
│   ├── logger/              # pino + Sentry
│   ├── config/              # ESLint / TSConfig / Prettier presets
│   └── api-client/          # OpenAPI-generated types
├── infra/
│   └── docker/              # docker-compose + init scripts
├── docs/
│   ├── design/              # 13-part design bible (see docs/design/README.md)
│   ├── adr/                 # Architecture Decision Records (22 entries)
│   ├── api/                 # OpenAPI specs
│   ├── architecture/        # System diagrams
│   ├── compliance/          # Data retention policy
│   ├── eval/                # RAG evaluation (golden QA + reports)
│   ├── hiring/              # Interview Q&A + portfolio LP + demo storyboards
│   ├── ops/                 # Runbook
│   └── security/            # STRIDE threat model
└── .github/workflows/       # CI / deploy / eval
```

## Tech stack

### Shipped in v0.1.0

- **Frontend**: Next.js 16 (App Router, Turbopack) · TypeScript 5 · TailwindCSS 4
- **Backend**: Next.js Route Handlers on Node runtime · Edge Runtime proxy
- **Database**: PostgreSQL 16 on Neon (Singapore) · Prisma 7 with `@prisma/adapter-pg`
- **Auth**: Auth.js v5 with JWT session strategy · Google + GitHub OAuth · PrismaAdapter
- **Deploy**: Vercel Hobby · GitHub Actions CI (lint / typecheck / test / build)
- **Security headers**: HSTS 2y · X-Frame-Options DENY · Referrer-Policy · Permissions-Policy
- **Testing**: Vitest (57 cases) · Playwright scaffold · k6 scenario
- **Drag & drop**: `@dnd-kit` sortable cards with LexoRank positions + optimistic UI + `VERSION_MISMATCH` rollback
- **Realtime**: Pusher Channels (free tier) — `board-<id>` fanout for card/list mutations; no-op locally when unconfigured
- **Invitations**: Token-hashed invitation flow (ADMIN+ creates, accept page binds membership). Resend-backed email delivery with graceful fallback to console log when `RESEND_API_KEY` is unset
- **Abuse defence**: Three-layer rate limits on invitation creation (global 1000/mo, per-workspace 50/day, per-user 20/day) — all env-override-able, 429 with specific error code on trip
- **Card comments**: thread per card with author + ADMIN-moderator deletion, soft-delete, 4000-char cap, Pusher fanout on create/delete
- **Activity log**: audit feed per workspace (card/list/comment create/update/move/delete) with cursor pagination, human-readable summaries, best-effort logging (log insert failure never aborts the business mutation)

### Planned (see [Roadmap](#roadmap))

- Storage: Vercel Blob (free tier)
- Observability: Sentry · Better Stack · UptimeRobot · pino · Web Vitals
- AI (Knowlex): Gemini Flash · Cohere Rerank · HyDE · Faithfulness check · pgvector + BM25 hybrid
- E2E + a11y + load: Playwright (10 scenarios) · axe-core · k6 (200 VU)

All production services are targeted to run within free-tier quotas (**$0/month**).

## Local development

### Prerequisites

- Node.js 20 LTS (`.nvmrc` pinned)
- pnpm 9+ (`packageManager` field pinned)
- Docker Desktop

### Boot

```bash
git clone https://github.com/leagames0221-sys/craftstack.git
cd craftstack
cp .env.example .env
docker compose up -d          # Postgres + Redis
pnpm install
pnpm dev:collab               # Boardly  on http://localhost:3000
pnpm dev:knowledge            # Knowlex  on http://localhost:3001
```

## Documentation map

| Area                    | Entry point                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Architecture overview   | [docs/architecture/system-overview.md](docs/architecture/system-overview.md)          |
| Decision records (22)   | [docs/adr/](docs/adr/README.md)                                                       |
| API specs (OpenAPI)     | [collab](docs/api/collab-openapi.yaml) · [knowledge](docs/api/knowledge-openapi.yaml) |
| Rate limits             | [docs/api/rate-limits.md](docs/api/rate-limits.md)                                    |
| STRIDE threat model     | [docs/security/threat-model.md](docs/security/threat-model.md)                        |
| Incident runbook        | [docs/ops/runbook.md](docs/ops/runbook.md)                                            |
| Data retention policy   | [docs/compliance/data-retention.md](docs/compliance/data-retention.md)                |
| RAG prompt registry     | [apps/knowledge/src/server/ai/prompts/](apps/knowledge/src/server/ai/prompts/)        |
| RAG evaluation          | [docs/eval/](docs/eval/README.md)                                                     |
| Interview Q&A (30)      | [docs/hiring/interview-qa.md](docs/hiring/interview-qa.md)                            |
| Portfolio landing copy  | [docs/hiring/portfolio-lp.md](docs/hiring/portfolio-lp.md)                            |
| Demo storyboard         | [docs/hiring/demo-storyboard.md](docs/hiring/demo-storyboard.md)                      |
| Design bible (13 parts) | [docs/design/README.md](docs/design/README.md)                                        |
| Contribution guide      | [CONTRIBUTING.md](CONTRIBUTING.md)                                                    |

## Roadmap

- ✅ **Week 1–2** — Monorepo scaffolding, CI, Docker Compose
- ✅ **Week 3** — Prisma schema (17 models), Auth.js v5 OAuth (Google+GitHub), 4-tier RBAC, Vitest (40 cases)
- ✅ **Boardly v0.1.0** — Deployed to Vercel + Neon + Upstash; authenticated dashboard, workspace & board CRUD working
- ✅ **Week 5** — Card/List CRUD with optimistic lock, editor modal, `@dnd-kit` drag-and-drop
- ✅ **Week 6** — Pusher Channels realtime fanout (card/list mutations broadcast to peers on the same board)
- ✅ **Week 4** — Resend-backed workspace invitations with token-hashed accept flow (7-day expiry, revocable, email-matching enforcement)
- 🚧 **Week 6 (follow-up)** — presence indicators, cursor sharing
- ⏳ **Week 7–9** — Attachments (Vercel Blob), search, notifications, multi-language, k6 load test
- ⏳ **Week 9–16** — Knowlex: ingestion pipeline, hybrid search, RAG with Faithfulness gate
- ⏳ **Week 17–18** — Demo videos, portfolio LP polish

## License

MIT — see [LICENSE](LICENSE).
