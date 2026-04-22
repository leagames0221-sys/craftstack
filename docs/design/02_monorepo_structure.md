---
name: Phase 1 - Monorepo 構成
type: project
---

# Phase 1: Monorepo ディレクトリ構成 + 初期セットアップ

## ツール

- Package manager: **pnpm 9+**
- Monorepo: **Turborepo 2.3+**
- Node: **20 LTS**(`.nvmrc` 固定)
- TypeScript: **5.7+** strict mode

## 全体ディレクトリ

```
craftstack/
├── apps/
│   ├── collab/             # Boardly
│   │   ├── src/{app,components,features,server,lib,styles}/
│   │   ├── prisma/{schema.prisma,migrations/}
│   │   ├── tests/{unit,e2e,contract}/
│   │   ├── Dockerfile
│   │   └── next.config.ts
│   └── knowledge/          # Knowlex
│       ├── src/
│       │   ├── app/, components/, features/
│       │   ├── server/{ai,embedding,rag,queue}/
│       │   └── server/ai/prompts/  # プロンプトレジストリ
│       └── ...
├── packages/
│   ├── ui/                 # shadcn/ui 共通
│   ├── auth/               # Auth.js v5 ラッパ
│   ├── db/                 # Prisma client singleton + withTenant()
│   ├── logger/             # pino + Sentry
│   ├── config/             # ESLint/TSConfig/Prettier 共通
│   └── api-client/         # OpenAPI 生成型
├── infra/
│   ├── docker/             # docker-compose.yml
│   ├── fly/                # fly.toml × 3 (collab-ws, knowledge, knowledge-worker)
│   └── scripts/            # seed.ts, migrate.ts
├── docs/
│   ├── adr/                # ADR 0001-0022
│   ├── api/                # *-openapi.yaml + rate-limits.md
│   ├── architecture/       # *.mmd + overview.md
│   ├── compliance/         # data-retention.md
│   ├── eval/               # golden_qa.yaml + reports/
│   ├── hiring/             # interview-qa.md + portfolio-lp.md + demo-storyboard.md
│   ├── ops/                # runbook.md
│   └── security/           # threat-model.md
├── .github/workflows/      # ci / deploy-collab / deploy-knowledge / eval / e2e
├── .husky/                 # pre-commit hooks
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .nvmrc                  # 20
├── LICENSE                 # MIT
└── README.md               # ルート README(両アプリ入口)
```

## ルート `package.json`(要点)

```json
{
  "name": "craftstack",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "turbo run dev",
    "dev:collab": "turbo run dev --filter=collab",
    "dev:knowledge": "turbo run dev --filter=knowledge",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "db:migrate": "turbo run db:migrate",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "prepare": "husky"
  }
}
```

## `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "test": { "dependsOn": ["^build"] },
    "test:e2e": { "dependsOn": ["build"], "cache": false },
    "db:migrate": { "cache": false }
  }
}
```

## ローカル開発 `docker-compose.yml`

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: craftstack
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redisdata:/data]
volumes:
  pgdata:
  redisdata:
```

**pgvector 入りの Postgres** を最初から採用 → 案 A/B 両方同じインスタンスでローカル動作。本番は Neon で別インスタンス(ADR-0018)。

## `.env.example`

```bash
NODE_ENV=development
DATABASE_URL=postgresql://app:app@localhost:5432/craftstack
DIRECT_DATABASE_URL=postgresql://migrator:migrator@localhost:5432/craftstack
REDIS_URL=redis://localhost:6379

AUTH_SECRET=replace-me
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

SENTRY_DSN=
BETTER_STACK_SOURCE_TOKEN=
RESEND_API_KEY=

# Knowlex only
GEMINI_API_KEY=
COHERE_API_KEY=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

## Phase 1 完了 DoD

- [ ] `pnpm dev:collab` でブランクページが localhost に表示
- [ ] `pnpm dev:knowledge` でブランクページが localhost に表示
- [ ] `pnpm lint` `pnpm test` が両アプリで通る
- [ ] GitHub Actions CI が緑
- [ ] `docker compose up` で Postgres(+pgvector)と Redis 起動
- [ ] ルート README に「なぜ monorepo か」「構成図」「起動手順」を記載
- [ ] ADR 0001(monorepo)本文が `docs/adr/` にある
