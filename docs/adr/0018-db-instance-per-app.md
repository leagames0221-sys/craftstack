# ADR-0018: Separate database instances per app

- Status: Accepted
- Date: 2026-04-22
- Tags: database, scalability

## Context

Co-locating Boardly and Knowlex in one Postgres instance would couple their failure modes and let Knowlex pgvector traffic steal resources from Boardly realtime queries.

## Decision

Two Neon projects: `boardly-db` and `knowlex-db`. Each has its own `app` and `migrator` roles, its own extensions, and its own backup schedule. Free tier allows up to 10 projects, well within budget.

## Consequences

Positive:

- Noisy-neighbor isolation between apps
- RLS policies in Knowlex cannot interfere with Boardly at all
- A production incident in one app stays there

Negative:

- Two sets of credentials to manage
- Two migration pipelines

## Alternatives

- Shared instance, schemas per app: rejected — resource contention
- Shared instance, same schema: rejected — incompatible RLS requirements
