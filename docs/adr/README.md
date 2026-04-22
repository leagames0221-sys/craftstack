# Architecture Decision Records

Each ADR captures a single, consequential design decision in MADR format.
Once Accepted, an ADR is immutable — later decisions supersede, they do not rewrite.

| #                                           | Title                                          | Status   |
| ------------------------------------------- | ---------------------------------------------- | -------- |
| [0001](0001-monorepo.md)                    | Monorepo (Turborepo + pnpm workspaces)         | Accepted |
| [0002](0002-prisma-orm.md)                  | Prisma as ORM                                  | Accepted |
| [0003](0003-auth-js-database-session.md)    | Auth.js v5 + database session strategy         | Accepted |
| [0004](0004-socket-io-redis-adapter.md)     | Socket.IO + Redis Adapter for realtime         | Accepted |
| [0005](0005-redis-pubsub-broadcast.md)      | Redis Pub/Sub for broadcast synchronization    | Accepted |
| [0006](0006-lexorank.md)                    | LexoRank for list/card ordering                | Accepted |
| [0007](0007-optimistic-locking.md)          | Optimistic locking via `version` column        | Accepted |
| [0008](0008-cloudflare-r2.md)               | Cloudflare R2 for object storage               | Accepted |
| [0009](0009-vercel-flyio-hybrid.md)         | Vercel + Fly.io hybrid deploy                  | Accepted |
| [0010](0010-rls-and-query-layer-defense.md) | RLS + query-layer double defense               | Accepted |
| [0011](0011-hybrid-search-rerank.md)        | Hybrid search (pgvector + BM25 + RRF) + rerank | Accepted |
| [0012](0012-embedding-separate-table.md)    | Embedding separated into its own table         | Accepted |
| [0013](0013-faithfulness-check.md)          | Faithfulness check for RAG grounding           | Accepted |
| [0014](0014-hyde.md)                        | HyDE (hypothetical document embeddings)        | Accepted |
| [0015](0015-eval-in-ci.md)                  | RAG evaluation integrated into CI              | Accepted |
| [0016](0016-free-tier-constraints.md)       | Free-tier infra constraints and mitigations    | Accepted |
| [0017](0017-release-order.md)               | Boardly-first release order                    | Accepted |
| [0018](0018-db-instance-per-app.md)         | Separate database instances per app            | Accepted |
| [0019](0019-conversation-tenant-trigger.md) | Conversation/Message tenant-member trigger     | Accepted |
| [0020](0020-prompt-registry.md)             | Prompt Git-managed with SHA256 tracking        | Accepted |
| [0021](0021-lexorank-library.md)            | Use existing `lexorank` npm package            | Accepted |
| [0022](0022-e2e-credentials-provider.md)    | E2E-only credentials provider                  | Accepted |

## Template

```markdown
# ADR-NNNN: <Title>

- Status: Proposed | Accepted | Superseded by ADR-NNNN | Deprecated
- Date: YYYY-MM-DD
- Tags: <comma separated>

## Context

Why was this decision needed? What are the constraints?

## Decision

What was decided, in one sentence.

## Consequences

Positive:

- ...
  Negative:
- ...

## Alternatives

- Option X: rejected because ...
```
