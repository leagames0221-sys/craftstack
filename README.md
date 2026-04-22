# craftstack

[![CI](https://github.com/leagames0221-sys/craftstack/actions/workflows/ci.yml/badge.svg)](https://github.com/leagames0221-sys/craftstack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20-brightgreen)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220)](./package.json)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org)

> Full-stack portfolio monorepo — **Boardly** (realtime collaborative kanban) + **Knowlex** (multi-tenant AI knowledge SaaS).

Two production-grade SaaS applications designed and built from schema to deploy, as a solo developer, to demonstrate full-stack × from-scratch engineering capability.

## Apps

| App                           | Description                              | Tech highlights                                                                               |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| [**Boardly**](apps/collab)    | Realtime collaborative kanban board      | Next.js 15 · Socket.IO · Redis Pub/Sub · Prisma · PostgreSQL · LexoRank · Optimistic locking  |
| [**Knowlex**](apps/knowledge) | Multi-tenant AI knowledge retrieval SaaS | Next.js 15 · pgvector · BullMQ · Gemini API · Cohere Rerank · RLS · HyDE · Faithfulness check |

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

- **Week 1–2** — Monorepo scaffolding, CI, Docker Compose (**in progress**)
- **Week 3–10** — Boardly implementation, deploy, first public release
- **Week 9–16** — Knowlex implementation (shared foundation reused from Week 9), deploy
- **Week 17–18** — README polishing, portfolio LP, demo videos, interview prep

## License

MIT — see [LICENSE](LICENSE).
