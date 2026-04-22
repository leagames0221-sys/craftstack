# ADR-0010: RLS + query-layer double defense

- Status: Accepted
- Date: 2026-04-22
- Tags: security, multi-tenant

## Context

In Knowlex, any cross-tenant read is a data breach. An ORM bug alone cannot be allowed to leak tenant data.

## Decision

Every tenant-scoped table enables RLS with a `tenant_id = current_setting('app.tenant_id')` policy. Each API handler wraps its Prisma calls in `withTenant(tenantId, ...)` which issues `SET LOCAL app.tenant_id` inside a transaction. Migrations run as a `migrator` role that holds `BYPASSRLS`; application runtime uses an `app` role that does not.

## Consequences

Positive:

- DB stops a bad query even if the application layer is wrong
- E2E tests can assert 0 cross-tenant rows
- Policies live with the schema under migration control

Negative:

- Every migration must run as `migrator`
- Policy predicates add cost to JOINs; covered by indexes

## Alternatives

- Application-layer only: rejected — one bug equals full breach
- Schema-per-tenant: rejected — schema explosion with growth
- Database-per-tenant: rejected — cost
