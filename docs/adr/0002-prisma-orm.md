# ADR-0002: Prisma as ORM

- Status: Accepted
- Date: 2026-04-22
- Tags: database, orm

## Context

Both apps target PostgreSQL. Knowlex also uses pgvector and Row-Level Security. We need a schema migration story and type-safe access that stays close to SQL.

## Decision

Use Prisma 7 with `@prisma/adapter-pg`. pgvector columns are declared in raw migrations; a small `Prisma.sql` helper performs vector similarity queries where the ORM does not cover them.

## Consequences

Positive:

- Generated types eliminate most ORM-to-call-site drift
- `prisma migrate` keeps schema evolution in version control
- Driver adapter pattern leaves a clear path to Neon HTTP driver in prod

Negative:

- pgvector still requires raw SQL helpers
- Prisma 7 requires an adapter at construction (breaking change from 6)

## Alternatives

- Drizzle: attractive SQL ergonomics, rejected for migration DX gap
- TypeORM: rejected — decorator-heavy maintenance
- Kysely: query builder only; no migration story
