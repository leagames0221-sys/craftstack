export type ClientLabel = {
  id: string;
  name: string;
  color: string;
};

export type ClientAssignee = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
};

export type ClientCard = {
  id: string;
  title: string;
  dueDate: string | null;
  version: number;
  labels: ClientLabel[];
  assignees: ClientAssignee[];
};

export type ClientList = {
  id: string;
  title: string;
  wipLimit: number | null;
  cards: ClientCard[];
};

/**
 * Return a lists array with every card's `labels` optionally filtered to
 * only those cards that match at least one of the supplied label ids
 * (union semantics — closer to the mental model of "narrow to these
 * topics"). Empty filter = passthrough. Card order within each list is
 * preserved; list structure is preserved even when a list becomes empty,
 * so the board shape stays stable while the user toggles filters.
 */
export function applyLabelFilter(
  lists: ClientList[],
  activeLabelIds: string[],
): ClientList[] {
  if (activeLabelIds.length === 0) return lists;
  const active = new Set(activeLabelIds);
  return lists.map((l) => ({
    ...l,
    cards: l.cards.filter((c) => c.labels.some((lb) => active.has(lb.id))),
  }));
}

/** Locate `cardId` in a set of lists. Returns `null` if not found. */
export function findCardLocation(
  lists: ClientList[],
  cardId: string,
): { listId: string; index: number } | null {
  for (const l of lists) {
    const idx = l.cards.findIndex((c) => c.id === cardId);
    if (idx >= 0) return { listId: l.id, index: idx };
  }
  return null;
}

/**
 * Return a new `lists` array with `cardId` moved to `destListId` at
 * `destIndex`. The src card is removed first, so `destIndex` is measured
 * against the *post-removal* slice (i.e. passing the dragged card's original
 * index within the same list is a no-op).
 */
export function applyMove(
  lists: ClientList[],
  cardId: string,
  destListId: string,
  destIndex: number,
): ClientList[] {
  const src = findCardLocation(lists, cardId);
  if (!src) return lists;
  const srcList = lists.find((l) => l.id === src.listId)!;
  const card = srcList.cards[src.index];

  return lists.map((l) => {
    if (l.id === src.listId && l.id === destListId) {
      const without = l.cards.filter((c) => c.id !== cardId);
      const clamped = Math.max(0, Math.min(destIndex, without.length));
      const next = [...without];
      next.splice(clamped, 0, card);
      return { ...l, cards: next };
    }
    if (l.id === src.listId) {
      return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
    }
    if (l.id === destListId) {
      const clamped = Math.max(0, Math.min(destIndex, l.cards.length));
      const next = [...l.cards];
      next.splice(clamped, 0, card);
      return { ...l, cards: next };
    }
    return l;
  });
}
