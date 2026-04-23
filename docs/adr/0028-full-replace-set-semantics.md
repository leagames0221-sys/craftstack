# ADR-0028: Full-replace set semantics for labels and assignees

- Status: Accepted
- Date: 2026-04-23
- Tags: api, semantics

## Context

Cards have many-to-many relationships with labels and with assignees. The "add" / "remove" operation pair is the traditional REST shape, but it's surprisingly awkward for a UI like a multi-select: the client has to diff old and new and emit two requests, the server can't atomically validate the resulting set, and partial failure yields a half-updated card.

## Decision

Expose a single endpoint per set: `PUT /api/cards/:id/labels` with `{ labelIds: string[] }` (and same for assignees). The server diffs against the current persisted set, validates the full desired state, and then emits side effects (notifications for new assignees, activity log entries) only for the _additions_, not the removals.

## Consequences

Positive:

- The client can simply send what it wants; there's no diff bookkeeping.
- Atomic validation: a cross-workspace label or a non-member assignee causes the entire request to fail cleanly.
- Notifications do not spam on removes — removing an assignee doesn't ping them; adding does.

Negative:

- Requires sending the full desired set, which grows the payload a little. Negligible for labels / assignees (realistic caps are small).
- A stale client could overwrite a concurrent addition; acceptable given the short interaction window for these pickers.

## Alternatives Considered

- **POST/DELETE pair** — rejected; partial-failure handling and client-side diff bookkeeping both got ugly.
- **JSON Patch** — rejected; disproportionate complexity for a two-level set.
- **Per-row toggle endpoints** — rejected; N+1 requests for a multi-select interaction.
