# ADR-0029: Cross-workspace guards on every set-mutation

- Status: Accepted
- Date: 2026-04-23
- Tags: security, tenancy, defense-in-depth

## Context

Boardly is multi-tenant: workspaces own boards, labels, and members, and none of these should leak across workspace boundaries. A buggy or malicious client could plausibly attempt to apply _workspace A_'s label to _workspace B_'s card, or to assign a _workspace B_ member to a card that lives in _workspace A_. Even with RBAC at the card level, without an explicit cross-workspace check these writes could succeed.

## Decision

Both `setCardLabels` and `setCardAssignees` explicitly resolve the target IDs back to their owning workspace and compare against the card's workspace before writing. Any mismatch throws a `ForbiddenError` with a precise code (`LABEL_WRONG_WORKSPACE`, `ASSIGNEE_NOT_MEMBER`). This is defense in depth on top of the RBAC gate — it enforces a structural invariant, not just a permission.

## Consequences

Positive:

- A single bug in the client (or a malicious one) cannot leak rows across tenants.
- The check is cheap: one `findMany` per write at most, typically with a tiny ID set.
- The codes make audit / telemetry useful: if one of these ever fires in production we learn exactly which invariant was breached.

Negative:

- Every set-mutation has to keep the guard in mind. We centralized it in the server functions so the route handlers can stay thin.
- Slightly more code in tests (every server function has a "can't cross tenants" case).

## Alternatives Considered

- **Rely on RBAC alone** — rejected; RBAC controls _who can act_, not _what shape the data can take_. A valid admin could still apply a wrong-workspace label.
- **Postgres RLS** — considered ([ADR-0010](0010-rls-and-query-layer-defense.md) proposes RLS long-term), but during the v0.x implementation phase we rely on query-layer guards and treat RLS as the next layer of defense to add.
