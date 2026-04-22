# ADR-0006: LexoRank for list/card ordering

- Status: Accepted
- Date: 2026-04-22
- Tags: data-model, performance

## Context

Kanban reordering happens constantly. Integer `position` columns force renumbering neighbors on every move, which conflicts with realtime and causes write amplification.

## Decision

Use the LexoRank scheme — string ranks that support `between(prev, next)` without renumbering. Ranks live in `List.position` and `Card.position`.

## Consequences

Positive:

- Reorder is a single-row UPDATE
- Realtime broadcast payloads stay small
- Rebalance is an occasional background job, not per-move

Negative:

- Ranks grow on repeated insertions at the same boundary; periodic rebalance required
- Not as human-readable as an integer

## Alternatives

- Integer position: rejected — N-row writes per reorder
- Prev/next linked list: rejected — JOIN-heavy reads
