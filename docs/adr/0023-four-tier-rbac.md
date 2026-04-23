# ADR-0023: Four-tier RBAC with a single `roleAtLeast` comparator

- Status: Accepted
- Date: 2026-04-23
- Tags: auth, rbac, server

## Context

Boardly has four distinct access levels that needed to be enforced at the server layer: viewers (read-only observers), editors (card/comment writers), admins (label curators, inviters, moderators), and owners (workspace-level superset). A naive approach would be per-feature boolean flags on `Membership` (`canInvite`, `canModerate`, `canCurateLabels`, …), but every new feature would require a schema migration and every gate would be a separate column lookup.

## Decision

Model roles as an ordered enum `VIEWER < EDITOR < ADMIN < OWNER` and gate every server function through a single `roleAtLeast(role, minimum)` comparator. Feature gates express the minimum required role; the comparator is the only piece that knows the ordering.

## Consequences

Positive:

- Adding a new feature gate is one line (`if (!roleAtLeast(role, "ADMIN")) throw ForbiddenError`), no schema work.
- Reviews are easy: grep for `roleAtLeast` and every authorization point is visible.
- The ordering matches real product language (admins can do everything editors can).

Negative:

- Roles can't be composed orthogonally (no "editor who can also curate labels"). A future need would require either adding an intermediate role or moving to a capability model (future ADR).
- All-or-nothing: a workspace can't downgrade a single admin without member-level overrides.

## Alternatives Considered

- **Per-feature boolean flags** — rejected because the schema churn cost scales linearly with feature count.
- **Capability-based ACLs** (`Membership.capabilities: string[]`) — rejected as overkill for 4 coarse tiers; will reconsider if Boardly grows beyond ~10 gated actions.
- **Cloud-provider-style IAM with policies** — rejected as disproportionate to a small SaaS.
