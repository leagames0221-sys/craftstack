# ADR-0025: LexoRank strings for list and card ordering

- Status: Accepted (implements [ADR-0006](0006-lexorank.md), library choice in [ADR-0021](0021-lexorank-library.md))
- Date: 2026-04-23
- Tags: ordering, database, performance

## Context

A board has lists; a list has cards. Users reorder constantly: drag-to-reorder, insert-between, move-across-lists. The naive approach — integer `position` columns — forces a bulk UPDATE of every sibling when something is inserted between two others. On a popular list that's O(N) writes per drag.

## Decision

Store `position` as a LexoRank string on both `List` and `Card`. A new position between A and B is `between(A, B)` — a single row update, no sibling rewrites. Use the `lexorank` npm package for Jira-compatible semantics and tested `between` logic.

## Consequences

Positive:

- Reorder is **one** UPDATE regardless of list length.
- `ORDER BY position ASC` is a simple B-tree index scan; no tie-breakers needed because the string space is dense.
- Rebalancing is lazy: a drift of `0|hzzzzz:...:n` only matters if it happens thousands of times on the same slot, and rebalancing is a maintenance job we can run offline.

Negative:

- Strings are longer than ints in the row; trivial at the scale we target.
- Requires a library or careful hand-rolled math. We took the library dependency.
- Debugging a "why is this card fourth" is slightly harder than reading an integer, but `ORDER BY position` always tells the truth.

## Alternatives Considered

- **Integer positions with bulk renumbering** — rejected; O(N) writes are unacceptable for a primary UX gesture.
- **Gapped integers** (100, 200, 300…) — rejected; gaps fill up eventually and you end up reimplementing LexoRank badly.
- **Linked-list next/prev pointers** — rejected; two writes per move plus no efficient `ORDER BY`.
