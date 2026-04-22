import { describe, expect, it } from "vitest";
import { applyTitleSearch, type ClientList } from "./dnd-helpers";

function makeLists(): ClientList[] {
  return [
    {
      id: "L1",
      title: "Todo",
      wipLimit: null,
      cards: [
        {
          id: "A",
          title: "Fix login bug",
          dueDate: null,
          version: 0,
          labels: [],
          assignees: [],
        },
        {
          id: "B",
          title: "Design review",
          dueDate: null,
          version: 0,
          labels: [],
          assignees: [],
        },
        {
          id: "C",
          title: "Deploy staging",
          dueDate: null,
          version: 0,
          labels: [],
          assignees: [],
        },
      ],
    },
    {
      id: "L2",
      title: "Done",
      wipLimit: null,
      cards: [
        {
          id: "D",
          title: "Login UI sketch",
          dueDate: null,
          version: 0,
          labels: [],
          assignees: [],
        },
      ],
    },
  ];
}

describe("applyTitleSearch", () => {
  it("empty query returns input unchanged (reference equality)", () => {
    const ls = makeLists();
    expect(applyTitleSearch(ls, "")).toBe(ls);
    expect(applyTitleSearch(ls, "   ")).toBe(ls);
  });

  it("case-insensitive substring match", () => {
    const out = applyTitleSearch(makeLists(), "LOGIN");
    expect(out[0].cards.map((c) => c.id)).toEqual(["A"]);
    expect(out[1].cards.map((c) => c.id)).toEqual(["D"]);
  });

  it("drops non-matching cards, preserves list shape", () => {
    const out = applyTitleSearch(makeLists(), "design");
    expect(out).toHaveLength(2);
    expect(out[0].cards.map((c) => c.id)).toEqual(["B"]);
    expect(out[1].cards).toEqual([]);
  });

  it("no matches anywhere -> lists with empty cards", () => {
    const out = applyTitleSearch(makeLists(), "zzzzz");
    expect(out[0].cards).toEqual([]);
    expect(out[1].cards).toEqual([]);
  });
});
