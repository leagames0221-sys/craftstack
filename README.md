# craftstack

[![CI](https://github.com/leagames0221-sys/craftstack/actions/workflows/ci.yml/badge.svg)](https://github.com/leagames0221-sys/craftstack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20-brightgreen)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220)](./package.json)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org)

> Full-stack portfolio monorepo — **Boardly** (realtime collaborative kanban) + **Knowlex** (multi-tenant AI knowledge SaaS).

Two production-grade SaaS applications designed and built from schema to deploy, as a solo developer, to demonstrate full-stack × from-scratch engineering capability.

## 🌐 Live demo

**Boardly**: <https://craftstack-collab.vercel.app>

Sign in with Google or GitHub to reach the authenticated dashboard. The workspace and board creation flows are wired end-to-end against Neon Postgres (Singapore) and Upstash Redis (Tokyo). Realtime editing (Socket.IO) and Knowlex RAG land in later milestones — see the roadmap below.

## Apps

| App                           | Description                              | Tech highlights                                                                               | Status               |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| [**Boardly**](apps/collab)    | Realtime collaborative kanban board      | Next.js 16 · Auth.js v5 · Prisma 7 · PostgreSQL · LexoRank · Optimistic locking · Socket.IO   | v0.1.0 — live deploy |
| [**Knowlex**](apps/knowledge) | Multi-tenant AI knowledge retrieval SaaS | Next.js 16 · pgvector · BullMQ · Gemini API · Cohere Rerank · RLS · HyDE · Faithfulness check | Schema ready         |

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

**Frontend:** Next.js 15 (App Router) · TypeScript · TailwindCSS · shadcn/ui · Zustand
**Backend:** Next.js Route Handlers · Hono · Socket.IO (Boardly) · BullMQ (Knowlex)
**Database:** PostgreSQL 16 · pgvector · Prisma · Row-Level Security (Knowlex)
**Cache / Queue:** Redis (Upstash in prod, compose locally)
**Auth:** Auth.js v5 · Google + GitHub OAuth
**AI:** Google Gemini Flash · Cohere Rerank · HyDE · Faithfulness check
**Storage:** Cloudflare R2 (S3-compatible)
**Deploy:** Vercel (SSR) + Fly.io (WebSocket / worker)
**Testing:** Vitest · Playwright · k6 · axe-core · custom RAG eval pipeline
**Observability:** Sentry · Better Stack · UptimeRobot · pino · Web Vitals

All production services are run within free-tier quotas (target: **$0/month**).

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
- 🚧 **Week 4–5** — Invitation email flow, Card PATCH optimistic lock, DnD
- 🚧 **Week 6** — Socket.IO realtime collaboration, presence, cursor sharing
- ⏳ **Week 7–9** — Attachments (R2), search, notifications, multi-language, k6 load test
- ⏳ **Week 9–16** — Knowlex: ingestion pipeline, hybrid search, RAG with Faithfulness gate
- ⏳ **Week 17–18** — Demo videos, portfolio LP polish

## License

MIT — see [LICENSE](LICENSE).
