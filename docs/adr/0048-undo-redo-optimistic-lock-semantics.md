# ADR-0048: Undo/redo ↔ optimistic-locking semantics under broadcast

- Status: Accepted
- Date: 2026-04-24
- Tags: boardly, ux, state, optimistic-lock, realtime

## Context

Three prior ADRs together describe card-move state:

- [ADR-0007](0007-optimistic-locking.md) / [ADR-0024](0024-optimistic-locking-version-column.md)
  — every `Card` row carries a `version` column; writes that supply a
  stale version return HTTP 409 `VERSION_MISMATCH`.
- [ADR-0036](0036-move-undo-redo-client-only.md) — a 25-entry client-only
  LIFO undo/redo stack, scoped to a single `<BoardClient>` mount. Each
  entry records `{ cardId, from, to }` and replays against the current
  board state, explicitly accepting "minor imprecision" when the original
  neighbour cards are no longer where they were at drag-time.

These three ADRs are correct individually but **do not document the
interaction surface** — specifically what happens in the four-cell matrix of
(self-undo | broadcast-received) × (target card fresh | target card stale).
Session 255 run #2 hiring-sim probe Q3 asked exactly this:

> Broadcast で他ユーザが動かした直後の自分の Ctrl+Z は何が起きる?
> undo stack と衝突解決の UX を実際どう設計した?

ADR-0036 answers half the question (the replay goes through the live move
API, so optimistic locking protects server state). It does _not_ answer the
UX question: if a user's undo stack contains an entry for card X, and
another user moved card X via broadcast while the local stack still thinks
X is at position P_old, what should the local user see when they hit
Ctrl-Z?

The implementation shipped in v0.4.x chose the quiet path: replay, catch
the 409, show the generic "someone else moved this card" toast, drop the
entry. A reviewer probing this would correctly notice that the generic
toast doesn't tell the user _which_ of their previous moves was
invalidated, and that the undo stack itself is never proactively marked
stale — it looks healthy until the user hits it and hits a wall.

This ADR names the contract that ties the three prior ADRs together and
specifies the explicit UX the three interaction cells need.

## Decision

Three rules, enforced in `move-history.ts` (pure functions) and surfaced
by `<BoardClient>` (the mount that holds the stack):

### Rule 1 — Staleness is proactive, not reactive

When a broadcast mutation arrives for card X via Pusher Channels
(`card.moved`, `card.updated`, `card.deleted`), the handler walks the
client's undo and redo stacks and marks every entry with `cardId === X`
as `stale: true`.

```ts
type HistoryEntry = {
  cardId: string;
  from: { listId: string; rank: string };
  to: { listId: string; rank: string };
  stale?: boolean;
  stalenessReason?: "concurrent-move" | "deletion" | "card-updated";
};
```

The stack length does not change — entries retain their position so the
user's undo/redo ordering stays predictable. `move-history.ts` gains a
`markStale(stack, cardId, reason)` pure function with 3 Vitest cases
(no-op when not found, flips single match, flips multiple matches).

### Rule 2 — Staleness shows up in UI before the user hits it

The undo/redo keyboard-shortcut UI (the small history indicator in the
command palette and the toast that appears on `Ctrl-Z`) reads stale count
and communicates it:

- If the next entry to pop is stale, pressing `Ctrl-Z` shows a toast:
  > "Your last move was modified by another user. Skipping to the
  > previous undo-able action."
  > …and continues popping until a non-stale entry is found or the stack is
  > empty.
- If the entire stack is stale, `Ctrl-Z` shows a single toast:
  > "No un-modified moves to undo."
  > …and does nothing. (No replay, no 409, no server round-trip.)

### Rule 3 — Deletion and updates have distinct behaviour

- **`card.moved` broadcast**: mark affected entries stale with reason
  `concurrent-move`. The replay _could_ still succeed (the 409 from the
  server version check is authoritative), but the UX signal is "another
  user moved this card, so your undo has a different meaning now."
- **`card.deleted` broadcast**: mark affected entries stale with reason
  `deletion`. Replay is impossible — the card row is gone. Toast copy
  reads "…was deleted by another user." Entry is dropped from the stack
  after the toast rather than kept as a permanent tombstone.
- **`card.updated` broadcast** (title, labels, assignees — anything that
  isn't a move): **do not** mark stale. Undo is scoped to moves, and a
  title edit by another user does not invalidate a move-undo. This is the
  single narrow exception to the "any change → stale" rule.

### Corollary — the server contract is unchanged

This ADR adds no server RPCs, no new endpoints, no schema columns. Staleness
lives entirely in the client's `move-history.ts` module. The server's
optimistic-lock contract (409 `VERSION_MISMATCH` on stale version) remains
the authoritative last line of defense — if a user's browser misses a
broadcast (network blip, tab throttled, presence state lost), the 409 path
still fires and shows the generic toast, falling back to ADR-0036 behaviour.

## Consequences

**What a reviewer tracing probe Q3 through the repo post-implementation sees**

- ADR-0048 is the stitch that was missing between ADR-0007/0024 and
  ADR-0036. Searching for `undo` or `Ctrl-Z` in `docs/adr/` now lands on
  the interaction contract, not just the locking primitive or the client
  stack.
- `apps/collab/src/lib/move-history.ts` gains `stale` as a first-class
  field and `markStale` as a pure transition, so Vitest can unit-test the
  contract without mounting `<BoardClient>`.
- `BoardClient` wires the Pusher `card.moved` / `card.deleted` /
  `card.updated` handlers to `markStale` before applying the incoming
  state, so the marker fires _before_ the local view updates — no race
  window where the user could hit `Ctrl-Z` between broadcast arrival and
  local state rewrite.

**Trade-offs admitted**

- **Stale entries stay visible.** The stack shows "Ctrl-Z (stale) /
  Ctrl-Shift-Z (ok)" in the history indicator. Some users will expect
  stale entries to auto-evict silently. Accepted because silent eviction
  makes undo feel non-deterministic; the explicit "skipped because
  another user modified this" message teaches the user what happened.
- **Deletion behavior loses the redo direction.** Once a card is deleted,
  both undo and redo stacks drop their deletion entries after the toast.
  A reviewer could argue for a "restore deleted card" UX — out of scope
  for this ADR; Boardly's deletion semantics are soft-delete-less at the
  card level today.
- **Single-browser assumption.** Two tabs of the same user on the same
  board each have their own undo stack — they do not sync. Acceptable:
  same behaviour as every other major kanban tool, and syncing undo across
  tabs would reintroduce the server-side operation-log complexity ADR-0036
  explicitly rejected.
- **`card.updated` exception is asymmetric with `card.moved`.** A reviewer
  could point out that "another user renamed this card title" feels like
  it should pair with an undo-stack staleness warning. The narrow rule
  (move-undo is scoped to moves) keeps the contract simple and matches
  user mental model — `Ctrl-Z` in a kanban tool means "undo my last
  drag," not "revert all changes to this card."

**What this unblocks**

- ADR-0047's workspace-scoped broadcasts get a clean undo model without
  needing a tenancy-aware redesign. `cardId` matching already scopes
  correctly because cards are workspace-scoped.
- Future expansion of the undo stack to cover label/assignee/due-date
  edits (currently out of scope per ADR-0036) gets a clear extension
  point: each new undo kind declares its own staleness semantics against
  the broadcast types that can invalidate it.
- The interview probe "what happens to undo under broadcast?" becomes a
  documented contract the candidate can point at, not a speak-in-real-time
  design exercise.

## Related

- [ADR-0007](0007-optimistic-locking.md) / [ADR-0024](0024-optimistic-locking-version-column.md) — version column + 409 `VERSION_MISMATCH` contract
- [ADR-0036](0036-move-undo-redo-client-only.md) — client-only 25-entry LIFO stack; this ADR tightens the "best-effort index" clause into explicit staleness
- [ADR-0030](0030-best-effort-side-effects.md) — broadcast fanout is best-effort; Rule 3's "missed broadcast → 409 fallback" follows the same regime
- [ADR-0047](0047-knowlex-workspace-tenancy-plan.md) — broadcasts are workspace-scoped post-tenancy; cardId matching is unchanged

## Not in scope

- Server-side undo ("multi-user undo") — explicitly rejected by ADR-0036 and not reopened here
- Cross-tab stack synchronization within the same user's browser
- Undo for non-move mutations (label set, assignee change, due-date edit) — tracked as a follow-up
- Redo-stack behaviour on branching timelines — unchanged from ADR-0036 (fresh move clears redo)
