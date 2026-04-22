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
- **Testing**: Vitest (130 unit cases) · Playwright (11 smoke scenarios, run with `pnpm --filter collab test:e2e`) · k6 scenario
- **Drag & drop**: `@dnd-kit` sortable cards with LexoRank positions + optimistic UI + `VERSION_MISMATCH` rollback
- **Realtime**: Pusher Channels (free tier) — `board-<id>` fanout for card/list mutations; no-op locally when unconfigured
- **Invitations**: Token-hashed invitation flow (ADMIN+ creates, accept page binds membership). Resend-backed email delivery with graceful fallback to console log when `RESEND_API_KEY` is unset
- **Abuse defence**: Three-layer rate limits on invitation creation (global 1000/mo, per-workspace 50/day, per-user 20/day) — all env-override-able, 429 with specific error code on trip
- **Card comments**: thread per card with author + ADMIN-moderator deletion, soft-delete, 4000-char cap, Pusher fanout on create/delete
- **Activity log**: audit feed per workspace (card/list/comment create/update/move/delete) with cursor pagination, human-readable summaries, best-effort logging (log insert failure never aborts the business mutation)
- **Labels**: workspace-scoped color-coded labels (ADMIN-curated palette), full-replace attach API with cross-workspace guard, dots on board cards + inline picker on the card modal
- **@mentions + Notifications bell**: comment body is scanned for `@handle` tokens (email-local-part or display-name match against workspace members), Mention rows + per-user Notification rows are written, header bell polls `/api/notifications` every 30s and shows an unread badge with a deep-link dropdown
- **Card assignees**: full-replace PUT with membership guard (cross-workspace assigns rejected), avatar stack on board cards with +N overflow, modal picker listing workspace members, newly-added assignees get an ASSIGNED notification (self-assigns silent)
- **Board label filter**: URL-driven (`?labels=id1,id2`) chip bar above the board — shareable, survives refresh, union semantics (card shown if it has **any** active label)

### Planned (see [Roadmap](#roadmap))

- Storage: Vercel Blob (free tier)
- Observability: Sentry · Better Stack · UptimeRobot · pino · Web Vitals
- AI (Knowlex): Gemini Flash · Cohere Rerank · HyDE · Faithfulness check · pgvector + BM25 hybrid
- E2E + a11y + load: Playwright (10 scenarios) · axe-core · k6 (200 VU)

All production services are targeted to run within free-tier quotas (**$0/month**).

## How this was built

This codebase is AI-assisted. Claude (Anthropic's Claude Code) was used as a pair-programmer for scaffolding, boilerplate, and tests; every architectural decision below was author-specified and author-reviewed before being committed. The author can whiteboard any of these patterns from scratch in an interview.

**Non-obvious decisions made in this repo, with rationales:**

- **Four-tier RBAC (OWNER > ADMIN > EDITOR > VIEWER)** with a single `roleAtLeast` comparator driving every server check. Chosen over boolean flags so the model scales to per-feature gates (labels ADMIN+, comments EDITOR+, activity VIEWER+) without schema churn.
- **Optimistic locking via `version` column** on Card. `updateMany` filters by `id + version`, 0 rows affected → 409 `VERSION_MISMATCH`. The client bumps its local version on success so rapid drags don't stale-conflict with themselves. Chosen over pessimistic locking because multiple editors on the same board is the norm.
- **LexoRank positions** for List + Card ordering. Reordering touches **one row** (`between(prev, next)`), not N. Using the `lexorank` npm package for Jira-compatible semantics.
- **Token-hashed invitations**. Plaintext token exists only in the email / UI; only `SHA-256(token)` is persisted. Accept requires the signed-in email to match the invitation's email — defeats token phishing and accidental link sharing.
- **Three-layer invitation rate limit** (global 1000/mo, per-workspace 50/day, per-user 20/day), counts include revoked+accepted rows so an attacker can't reset quota by revoking. Trip returns a specific error code so the UI explains which quota fired.
- **Full-replace set semantics** for labels and assignees (`PUT /api/cards/:id/labels` with the desired `labelIds[]`). Simpler to reason about than two endpoints; the server diffs against current state and emits the right notifications for adds only (no spam on removes).
- **Cross-workspace guards** on both `setCardLabels` and `setCardAssignees`. A card in workspace A cannot be tagged with a label from workspace B, cannot be assigned to a user who isn't a member. Defense in depth against tenant leaks from a malicious or buggy client.
- **Best-effort side effects**. Activity log inserts, Pusher broadcasts, Resend emails, and notification rows are all wrapped so a failure cannot abort the originating business write. Every one catches + console.warns and returns — the user's card save is the transactional piece; fanout is cosmetic.
- **URL as source of truth** for board filters (`?labels=…`, `?q=…`). Shareable, refresh-survives, composable. Chosen over a local React store so a user can paste a filtered-board URL into Slack.
- **@mention resolution**: email local-part OR display-name slug. The regex is tuned to _not_ match email addresses in running text (`contact me at alice@example.com` doesn't fire).
- **Env-guarded integrations** (Pusher, Resend). Missing credentials = silent no-op with a fallback (console log of accept URL, cross-tab refresh skipped). Means the app runs end-to-end locally without any external signup.

See also the per-module doc comments in `apps/collab/src/server/*.ts` — each exported function has a short rationale for the specific design choice.

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
