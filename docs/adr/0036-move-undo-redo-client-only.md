# ADR-0036: Client-only undo / redo for card moves

- Status: Accepted
- Date: 2026-04-23
- Tags: ux, state, optimistic-lock

## Context

Card moves are the most frequent mutation on a board, and they are also the easiest one to misclick. Users dropping a card into the wrong list expect `Ctrl-Z` to reverse the last move — it's a near-universal convention. Doing this server-side would mean an audit-log-replay subsystem with all the usual eventual-consistency baggage; for a single-user LIFO undo of the most recent gesture, that's wildly over-engineered.

## Decision

Undo / redo lives entirely on the client, scoped to a single `<BoardClient>` mount:

- A bounded LIFO stack (capped at 25 entries) records `{ cardId, from, to }` endpoints on every successful drag
- `Ctrl-Z` / `⌘-Z` pops the undo stack and replays `/api/cards/:id/move` with the `from` endpoint; the entry moves onto the redo stack
- `Ctrl-Shift-Z` / `⌘-Shift-Z` does the inverse
- The replay reuses the existing optimistic-lock-protected move API (see [ADR-0024](0024-optimistic-locking-version-column.md)) — the current client `version` is supplied, and a 409 surfaces the same "someone else moved this card" toast as a live drag would
- A fresh move clears the redo stack (branching timeline invalidates forward history)
- Refreshing the page clears the stack entirely, matching browser-undo semantics

The stack data model and transitions are extracted into `move-history.ts` as pure functions so the state machine can be unit-tested without mounting the UI (6 Vitest cases cover empty, push, cap, popUndo, popRedo, redo-clears-on-new-push).

## Consequences

Positive:

- User-visible feature with near-zero server impact — reuses the existing `move` endpoint so optimistic locking, cross-workspace guards, and activity-log side effects all still fire correctly
- Stack state is component-scoped; no context / store / persistence layer needed
- Pure state-machine module is trivially testable

Negative:

- Stack is lost on navigation / refresh. Acceptable — browsers and desktop apps behave the same way
- A move is replayed against the _current_ board state, not the state the user saw at drag-time. If the original neighbor cards were deleted or moved by a collaborator, the replay lands at a best-effort index (fall back to append). We accept the minor imprecision rather than fighting concurrent edits

## Alternatives Considered

- **Server-side operation log** with a `/api/boards/:id/undo` endpoint — rejected as disproportionate for single-user move undo; also raises multi-user ambiguity questions we don't need to solve
- **Multi-gesture undo** (group consecutive drags within a few-second window) — deferred; the current per-drag granularity matches most kanban tools (Trello, Linear)
- **Persist stack to localStorage** — rejected; users don't expect cross-session undo for transient UI gestures, and it would conflict with server-side changes that happened while the tab was closed
