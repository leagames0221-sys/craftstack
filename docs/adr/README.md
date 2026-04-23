# Architecture Decision Records

Each ADR captures a single, consequential design decision in MADR format.
Once Accepted, an ADR is immutable — later decisions supersede, they do not rewrite.

> **Note on numbers**: Benchmark figures embedded in individual ADRs (e.g. "Context Precision 0.89", "p95 < 300ms", "+8 pt improvement") are **design targets**, not current measurements. They become measured once the corresponding subsystem ships. The first authenticated deploy (v0.1.0) has not yet exercised realtime, RAG, or load paths. Measurements will replace target text here as each milestone lands.

> **Supersession notice**: [ADR-0003](0003-auth-js-database-session.md) specified a database session strategy. It was superseded in practice by the JWT strategy to unblock the Vercel Edge Runtime proxy; see the `fix(auth)` commit in git history for the rationale. A formal ADR-0023 will replace it when the next batch lands.

| #                                                               | Title                                                   | Status   |
| --------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| [0001](0001-monorepo.md)                                        | Monorepo (Turborepo + pnpm workspaces)                  | Accepted |
| [0002](0002-prisma-orm.md)                                      | Prisma as ORM                                           | Accepted |
| [0003](0003-auth-js-database-session.md)                        | Auth.js v5 + database session strategy                  | Accepted |
| [0004](0004-socket-io-redis-adapter.md)                         | Socket.IO + Redis Adapter for realtime                  | Accepted |
| [0005](0005-redis-pubsub-broadcast.md)                          | Redis Pub/Sub for broadcast synchronization             | Accepted |
| [0006](0006-lexorank.md)                                        | LexoRank for list/card ordering                         | Accepted |
| [0007](0007-optimistic-locking.md)                              | Optimistic locking via `version` column                 | Accepted |
| [0008](0008-cloudflare-r2.md)                                   | Cloudflare R2 for object storage                        | Accepted |
| [0009](0009-vercel-flyio-hybrid.md)                             | Vercel + Fly.io hybrid deploy                           | Accepted |
| [0010](0010-rls-and-query-layer-defense.md)                     | RLS + query-layer double defense                        | Accepted |
| [0011](0011-hybrid-search-rerank.md)                            | Hybrid search (pgvector + BM25 + RRF) + rerank          | Accepted |
| [0012](0012-embedding-separate-table.md)                        | Embedding separated into its own table                  | Accepted |
| [0013](0013-faithfulness-check.md)                              | Faithfulness check for RAG grounding                    | Accepted |
| [0014](0014-hyde.md)                                            | HyDE (hypothetical document embeddings)                 | Accepted |
| [0015](0015-eval-in-ci.md)                                      | RAG evaluation integrated into CI                       | Accepted |
| [0016](0016-free-tier-constraints.md)                           | Free-tier infra constraints and mitigations             | Accepted |
| [0017](0017-release-order.md)                                   | Boardly-first release order                             | Accepted |
| [0018](0018-db-instance-per-app.md)                             | Separate database instances per app                     | Accepted |
| [0019](0019-conversation-tenant-trigger.md)                     | Conversation/Message tenant-member trigger              | Accepted |
| [0020](0020-prompt-registry.md)                                 | Prompt Git-managed with SHA256 tracking                 | Accepted |
| [0021](0021-lexorank-library.md)                                | Use existing `lexorank` npm package                     | Accepted |
| [0022](0022-e2e-credentials-provider.md)                        | E2E-only credentials provider                           | Accepted |
| [0023](0023-four-tier-rbac.md)                                  | Four-tier RBAC with `roleAtLeast` comparator            | Accepted |
| [0024](0024-optimistic-locking-version-column.md)               | Optimistic locking via `version` column on Card         | Accepted |
| [0025](0025-lexorank-positions.md)                              | LexoRank strings for list and card ordering             | Accepted |
| [0026](0026-token-hashed-invitations.md)                        | Token-hashed invitations with email-bound accept        | Accepted |
| [0027](0027-three-layer-invitation-rate-limit.md)               | Three-layer invitation rate limit                       | Accepted |
| [0028](0028-full-replace-set-semantics.md)                      | Full-replace set semantics for labels / assignees       | Accepted |
| [0029](0029-cross-workspace-guards.md)                          | Cross-workspace guards on set-mutations                 | Accepted |
| [0030](0030-best-effort-side-effects.md)                        | Best-effort side effects separated from business writes | Accepted |
| [0031](0031-url-as-state-for-filters.md)                        | URL query string as source of truth for filters         | Accepted |
| [0032](0032-mention-resolution-and-env-guarded-integrations.md) | `@mention` resolution and env-guarded integrations      | Accepted |

## Implementation-phase addendum (0023–0032)

ADRs 0001–0022 were written during the design phase and describe intended shapes. ADRs 0023–0032 were written during the v0.1.x / v0.2.x implementation and document the ten decisions surfaced in the README's "How this was built" section. They overlap intentionally with some earlier ADRs (0006/0007/0021 on ordering and locking) because the implementation-phase record captures _what was actually built and why_, while the design-phase record captures _what was planned_. Both are useful; neither supersedes the other.

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
