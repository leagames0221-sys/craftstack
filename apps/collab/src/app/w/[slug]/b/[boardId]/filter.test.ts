import { describe, expect, it } from "vitest";
import { applyLabelFilter, type ClientList } from "./dnd-helpers";

function makeLists(): ClientList[] {
  return [
    {
      id: "L1",
      title: "Todo",
      wipLimit: null,
      cards: [
        {
          id: "A",
          title: "A",
          dueDate: null,
          version: 0,
          labels: [{ id: "bug", name: "Bug", color: "#f00" }],
          assignees: [],
        },
        {
          id: "B",
          title: "B",
          dueDate: null,
          version: 0,
          labels: [
            { id: "bug", name: "Bug", color: "#f00" },
            { id: "ui", name: "UI", color: "#00f" },
          ],
          assignees: [],
        },
        {
          id: "C",
          title: "C",
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
          title: "D",
          dueDate: null,
          version: 0,
          labels: [{ id: "ui", name: "UI", color: "#00f" }],
          assignees: [],
        },
      ],
    },
  ];
}

describe("applyLabelFilter", () => {
  it("empty filter returns the input unchanged", () => {
    const ls = makeLists();
    expect(applyLabelFilter(ls, [])).toBe(ls);
  });

  it("filters union (ANY match)", () => {
    const out = applyLabelFilter(makeLists(), ["bug"]);
    expect(out[0].cards.map((c) => c.id)).toEqual(["A", "B"]);
    expect(out[1].cards.map((c) => c.id)).toEqual([]);
  });

  it("multi-label filter unions matches across cards", () => {
    const out = applyLabelFilter(makeLists(), ["bug", "ui"]);
    expect(out[0].cards.map((c) => c.id)).toEqual(["A", "B"]);
    expect(out[1].cards.map((c) => c.id)).toEqual(["D"]);
  });

  it("preserves list structure even when a list becomes empty", () => {
    const out = applyLabelFilter(makeLists(), ["bug"]);
    expect(out).toHaveLength(2);
    expect(out[1].id).toBe("L2");
  });
});
