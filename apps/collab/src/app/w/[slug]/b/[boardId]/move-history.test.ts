import { describe, expect, it } from "vitest";

import {
  MAX_HISTORY,
  emptyHistory,
  popRedo,
  popUndo,
  pushMove,
} from "./move-history";

const entry = (n: number) => ({
  cardId: `c${n}`,
  from: { listId: "l1", beforeId: null, afterId: null },
  to: { listId: "l2", beforeId: null, afterId: null },
});

describe("move-history", () => {
  it("starts empty", () => {
    const h = emptyHistory();
    expect(h.undo).toEqual([]);
    expect(h.redo).toEqual([]);
  });

  it("pushMove appends to undo and clears redo", () => {
    let h = pushMove(emptyHistory(), entry(1));
    h = pushMove(h, entry(2));
    // Force something onto redo, then push a new move → redo clears.
    const popped = popUndo(h)!;
    h = popped.next;
    expect(h.redo).toHaveLength(1);
    h = pushMove(h, entry(3));
    expect(h.redo).toEqual([]);
    expect(h.undo.map((e) => e.cardId)).toEqual(["c1", "c3"]);
  });

  it("popUndo returns null when empty", () => {
    expect(popUndo(emptyHistory())).toBeNull();
  });

  it("popUndo moves the entry onto the redo stack", () => {
    let h = pushMove(emptyHistory(), entry(1));
    h = pushMove(h, entry(2));
    const popped = popUndo(h)!;
    expect(popped.entry.cardId).toBe("c2");
    expect(popped.next.undo.map((e) => e.cardId)).toEqual(["c1"]);
    expect(popped.next.redo.map((e) => e.cardId)).toEqual(["c2"]);
  });

  it("popRedo is the inverse of popUndo", () => {
    const h = pushMove(emptyHistory(), entry(1));
    const afterUndo = popUndo(h)!.next;
    const afterRedo = popRedo(afterUndo)!;
    expect(afterRedo.entry.cardId).toBe("c1");
    expect(afterRedo.next.undo.map((e) => e.cardId)).toEqual(["c1"]);
    expect(afterRedo.next.redo).toEqual([]);
  });

  it("caps the undo stack at MAX_HISTORY", () => {
    let h = emptyHistory();
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      h = pushMove(h, entry(i));
    }
    expect(h.undo).toHaveLength(MAX_HISTORY);
    // Oldest should have dropped off.
    expect(h.undo[0].cardId).toBe(`c${5}`);
    expect(h.undo[h.undo.length - 1].cardId).toBe(`c${MAX_HISTORY + 4}`);
  });
});
