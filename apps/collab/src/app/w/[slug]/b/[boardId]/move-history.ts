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

export type MoveEntry = {
  cardId: string;
  from: MoveEndpoint;
  to: MoveEndpoint;
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

function capped<T>(arr: T[]): T[] {
  if (arr.length <= MAX_HISTORY) return arr;
  return arr.slice(arr.length - MAX_HISTORY);
}
