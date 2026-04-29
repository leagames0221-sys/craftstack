# ADR-0010: RLS + query-layer double defense

- Status: **Partially superseded — RLS deferred** (v0.5.12 multi-tenant transition per [ADR-0061](0061-knowlex-auth-and-tenancy.md) chose application-side enforcement via Auth.js + `Membership` table + demo allow-list pattern over RLS for simpler operator surface; RLS remains a viable future option but is not the shipped path. Query-layer parameterized-query defense from this ADR is in force. Status updated v0.5.19 / [ADR-0069](0069-run6-findings-closure-and-page-surface-coverage.md) § Finding D3 — prior bare "Accepted" contradicted prose in threat-model + attestation `scope.deferred[ADR-0010]` + interview-qa Q9 + system-overview.md.)
- Date: 2026-04-22 (originally) / 2026-04-29 (Status updated post-Run-#6)
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
