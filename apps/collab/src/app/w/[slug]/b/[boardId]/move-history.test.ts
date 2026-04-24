import { describe, expect, it } from "vitest";

import {
  MAX_HISTORY,
  emptyHistory,
  markStale,
  popRedo,
  popUndo,
  pushMove,
  removeByCardId,
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

  // ADR-0048 — staleness contract under broadcast.
  describe("markStale", () => {
    it("is a no-op when the cardId is not present in either stack", () => {
      const h = pushMove(emptyHistory(), entry(1));
      const after = markStale(h, "c99", "concurrent-move");
      expect(after.undo[0].stale).toBeUndefined();
      expect(after.undo).toHaveLength(1);
      expect(after.redo).toHaveLength(0);
    });

    it("flips a single matching undo entry and records the reason", () => {
      let h = pushMove(emptyHistory(), entry(1));
      h = pushMove(h, entry(2));
      const after = markStale(h, "c2", "concurrent-move");
      expect(after.undo[0].stale).toBeUndefined();
      expect(after.undo[1].stale).toBe(true);
      expect(after.undo[1].stalenessReason).toBe("concurrent-move");
      // Stack length preserved per ADR-0048 — ordering must stay predictable.
      expect(after.undo).toHaveLength(2);
    });

    it("flips every matching entry across both undo and redo stacks", () => {
      // Move c2 onto undo, then c2 again (same card, hypothetical second
      // drag), then popUndo so one copy lives on redo.
      let h = pushMove(emptyHistory(), entry(2));
      h = pushMove(h, entry(3));
      h = pushMove(h, entry(2)); // a second drag of c2
      h = popUndo(h)!.next; // the second c2 drag moves onto redo
      expect(h.undo.map((e) => e.cardId)).toEqual(["c2", "c3"]);
      expect(h.redo.map((e) => e.cardId)).toEqual(["c2"]);

      const after = markStale(h, "c2", "concurrent-move");
      expect(after.undo[0].stale).toBe(true); // first c2 in undo
      expect(after.undo[1].stale).toBeUndefined(); // c3 untouched
      expect(after.redo[0].stale).toBe(true); // second c2 now on redo
    });

    it("updates stalenessReason when called a second time with a more severe reason", () => {
      let h = pushMove(emptyHistory(), entry(1));
      h = markStale(h, "c1", "concurrent-move");
      expect(h.undo[0].stalenessReason).toBe("concurrent-move");
      // A concurrent-move can be followed by the card being deleted
      // entirely. ADR-0048 prefers the more recent reason so the
      // toast copy reflects the deletion.
      h = markStale(h, "c1", "deletion");
      expect(h.undo[0].stale).toBe(true);
      expect(h.undo[0].stalenessReason).toBe("deletion");
    });
  });

  describe("removeByCardId", () => {
    it("strips every entry with the given cardId from both stacks", () => {
      let h = pushMove(emptyHistory(), entry(1));
      h = pushMove(h, entry(2));
      h = pushMove(h, entry(3));
      h = popUndo(h)!.next; // c3 → redo
      expect(h.undo.map((e) => e.cardId)).toEqual(["c1", "c2"]);
      expect(h.redo.map((e) => e.cardId)).toEqual(["c3"]);

      const after = removeByCardId(h, "c2");
      expect(after.undo.map((e) => e.cardId)).toEqual(["c1"]);
      expect(after.redo.map((e) => e.cardId)).toEqual(["c3"]);
    });

    it("is a no-op when the cardId is not present", () => {
      let h = pushMove(emptyHistory(), entry(1));
      h = pushMove(h, entry(2));
      const after = removeByCardId(h, "c99");
      expect(after).toEqual(h);
    });
  });
});
