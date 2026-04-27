# Contributing to craftstack

This is a solo portfolio project, but the workflow mirrors what I would run on a team. PRs and issues are welcome if you see something.

## Getting set up

```bash
node --version   # must be >= 20
pnpm --version   # must be >= 9
docker --version # for local Postgres + Redis
```

```bash
git clone https://github.com/leagames0221-sys/craftstack.git
cd craftstack
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter collab exec prisma generate
pnpm dev:collab        # http://localhost:3000
```

## Branch, commit, PR

- Work on a feature branch: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`
- Commit messages follow Conventional Commits: `type(scope): summary`
  - `type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`
  - `scope`: app or package name — `collab`, `knowledge`, `db`, `auth`, `ci`
  - Example: `feat(collab): add card optimistic lock PATCH`
- One PR per logical unit. Keep them reviewable in a single sitting.

## Before you open a PR

Run the full local CI equivalent:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Every step must be green. CI runs the same sequence.

## ADRs

Any decision that outlives a single PR goes into `docs/adr/`. Use the template in `docs/adr/README.md`. Do not edit an Accepted ADR — supersede it with a new one.

## Environment secrets

Never commit real secrets. `.env.example` is the source of truth for which keys exist; `.env` stays untracked. Deployment secrets live in the Vercel project dashboards (`craftstack-collab` and `craftstack-knowledge`); third-party credentials (Pusher, Resend, Gemini, Sentry, Upstash) are also injected through Vercel env vars per scope (Production / Preview / Development).

## Benchmark values in README

The README will eventually quote p95 latency and RAG eval numbers. Those come from automated runs only — do not copy proposed or target numbers into the README until a run produces them.
