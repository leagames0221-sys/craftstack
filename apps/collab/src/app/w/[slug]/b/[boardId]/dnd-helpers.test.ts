import { describe, expect, it } from "vitest";
import { applyMove, findCardLocation, type ClientList } from "./dnd-helpers";

function makeLists(): ClientList[] {
  return [
    {
      id: "L1",
      title: "Todo",
      wipLimit: null,
      cards: [
        { id: "A", title: "A", dueDate: null, version: 0, labels: [] },
        { id: "B", title: "B", dueDate: null, version: 0, labels: [] },
        { id: "C", title: "C", dueDate: null, version: 0, labels: [] },
      ],
    },
    {
      id: "L2",
      title: "Doing",
      wipLimit: null,
      cards: [{ id: "D", title: "D", dueDate: null, version: 0, labels: [] }],
    },
  ];
}

describe("findCardLocation", () => {
  it("locates a card in its list", () => {
    expect(findCardLocation(makeLists(), "B")).toEqual({
      listId: "L1",
      index: 1,
    });
  });

  it("returns null for unknown card", () => {
    expect(findCardLocation(makeLists(), "ZZZ")).toBeNull();
  });
});

describe("applyMove within same list", () => {
  it("moves A from index 0 to index 2 (after C)", () => {
    const out = applyMove(makeLists(), "A", "L1", 2);
    expect(out[0].cards.map((c) => c.id)).toEqual(["B", "C", "A"]);
    expect(out[1].cards.map((c) => c.id)).toEqual(["D"]);
  });

  it("moves C from index 2 to index 0", () => {
    const out = applyMove(makeLists(), "C", "L1", 0);
    expect(out[0].cards.map((c) => c.id)).toEqual(["C", "A", "B"]);
  });
});

describe("applyMove across lists", () => {
  it("moves A from L1 to L2 at index 0", () => {
    const out = applyMove(makeLists(), "A", "L2", 0);
    expect(out[0].cards.map((c) => c.id)).toEqual(["B", "C"]);
    expect(out[1].cards.map((c) => c.id)).toEqual(["A", "D"]);
  });

  it("appends to empty-ish list when destIndex overflows", () => {
    const out = applyMove(makeLists(), "A", "L2", 99);
    expect(out[1].cards.map((c) => c.id)).toEqual(["D", "A"]);
  });
});

describe("applyMove returns lists unchanged for unknown card", () => {
  it("noop", () => {
    const lists = makeLists();
    const out = applyMove(lists, "ZZZ", "L1", 0);
    expect(out).toBe(lists);
  });
});
