/**
 * Bounded LIFO undo / redo stack for card moves on a single board instance.
 *
 * Each entry captures the board coordinates *before* and *after* a
 * user-initiated drag:
 *
 *   from: the card's source list + its neighbors in that list at drag-start
 *   to:   the same shape for where it landed
 *
 * Undo pops a `from`-shaped target and replays `/api/cards/:id/move` so the
 * card returns to its pre-drag position; redo does the inverse. This keeps
 * the operation compatible with the existing optimistic-lock move API — we
 * simply fetch the current `version` from local state at replay time.
 *
 * The stack is intentionally local to one BoardClient mount: refreshing
 * the page clears it, which matches user intuition (browser undo isn't
 * persistent either) and sidesteps the cross-client consistency question.
 *
 * Pure functions so the state machine can be unit-tested without mounting
 * the board UI.
 */

export type MoveEndpoint = {
  listId: string;
  beforeId: string | null;
  afterId: string | null;
};

/**
 * `stale` and `stalenessReason` (ADR-0048): when a broadcast
 * `card.moved` or `card.deleted` event arrives for a card whose id
 * already lives in the local undo or redo stack, the matching
 * entries are marked stale before the local view updates. Pressing
 * Ctrl-Z on a stale entry is the UI's cue to show a scoped toast
 * and continue popping — the replay itself would still hit the
 * server's 409 `VERSION_MISMATCH` defense, but the staleness flag
 * lets the UI explain *why* the undo isn't doing what the user
 * expected. `card.updated` (title / labels / assignees) does NOT
 * mark stale — undo is scoped to moves per ADR-0036.
 *
 * Both fields are optional so v0.4.2 consumers that never call
 * `markStale` continue to type-check unchanged.
 */
export type StalenessReason = "concurrent-move" | "deletion" | "card-updated";

export type MoveEntry = {
  cardId: string;
  from: MoveEndpoint;
  to: MoveEndpoint;
  stale?: boolean;
  stalenessReason?: StalenessReason;
};

export type MoveHistory = {
  undo: MoveEntry[];
  redo: MoveEntry[];
};

export const MAX_HISTORY = 25;

export function emptyHistory(): MoveHistory {
  return { undo: [], redo: [] };
}

/**
 * Record a user-initiated move. New moves clear the redo stack — once the
 * user branches timeline, forward-history is stale.
 */
export function pushMove(h: MoveHistory, entry: MoveEntry): MoveHistory {
  return {
    undo: capped([...h.undo, entry]),
    redo: [],
  };
}

/**
 * Pop the most recent move for undo. The reversed entry is queued onto
 * the redo stack so a subsequent redo can replay it.
 */
export function popUndo(
  h: MoveHistory,
): { next: MoveHistory; entry: MoveEntry } | null {
  if (h.undo.length === 0) return null;
  const entry = h.undo[h.undo.length - 1];
  return {
    entry,
    next: {
      undo: h.undo.slice(0, -1),
      redo: capped([...h.redo, entry]),
    },
  };
}

/**
 * Pop the most recent redo. Mirrors popUndo.
 */
export function popRedo(
  h: MoveHistory,
): { next: MoveHistory; entry: MoveEntry } | null {
  if (h.redo.length === 0) return null;
  const entry = h.redo[h.redo.length - 1];
  return {
    entry,
    next: {
      undo: capped([...h.undo, entry]),
      redo: h.redo.slice(0, -1),
    },
  };
}

/**
 * Mark every entry whose `cardId` matches as stale (ADR-0048).
 * Call this from the BoardClient broadcast handler *before* the
 * local view state updates, so the user cannot press Ctrl-Z in the
 * race window between broadcast arrival and state rewrite.
 *
 * Stack lengths are preserved — entries retain their positions so
 * the user's undo/redo ordering stays predictable. The `reason`
 * value is surfaced to the UI so the toast copy can differentiate
 * between "another user moved this card" and "another user deleted
 * this card" (ADR-0048 Rule 3).
 *
 * Idempotent: marking an already-stale entry is a no-op on stale,
 * but updates `stalenessReason` to the most recent reason — if a
 * card is moved then deleted by the same or another user, the
 * stack reflects the deletion (the more severe state).
 *
 * `card.updated` callers should NOT reach this function per
 * ADR-0048 Rule 3 — undo is move-scoped. The `"card-updated"`
 * reason is exposed as a valid value anyway so a future extension
 * (non-move undo) can use it without a breaking type change.
 */
export function markStale(
  h: MoveHistory,
  cardId: string,
  reason: StalenessReason,
): MoveHistory {
  const apply = (stack: MoveEntry[]): MoveEntry[] =>
    stack.map((entry) =>
      entry.cardId === cardId
        ? { ...entry, stale: true, stalenessReason: reason }
        : entry,
    );
  return {
    undo: apply(h.undo),
    redo: apply(h.redo),
  };
}

/**
 * Remove every entry whose `cardId` matches from both stacks
 * (ADR-0048 Rule 3, `card.deleted` branch). The UI should call this
 * *after* showing the "card was deleted by another user" toast, so
 * the deletion entry is gone rather than kept as a permanent
 * tombstone. Contrast with `markStale`, which keeps entries in
 * place for the concurrent-move case.
 */
export function removeByCardId(h: MoveHistory, cardId: string): MoveHistory {
  return {
    undo: h.undo.filter((entry) => entry.cardId !== cardId),
    redo: h.redo.filter((entry) => entry.cardId !== cardId),
  };
}

function capped<T>(arr: T[]): T[] {
  if (arr.length <= MAX_HISTORY) return arr;
  return arr.slice(arr.length - MAX_HISTORY);
}
