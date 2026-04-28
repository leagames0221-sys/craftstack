import { describe, expect, it } from "vitest";
import { fuseRRF, RRF_K } from "./rrf";

describe("fuseRRF", () => {
  it("fuses a single list into a self-similar ordering (rank-preserving)", () => {
    const got = fuseRRF([
      {
        name: "vector",
        items: [{ id: "a" }, { id: "b" }, { id: "c" }],
      },
    ]);
    expect(got.map((x) => x.id)).toEqual(["a", "b", "c"]);
    // Single list: score is just w / (k + rank+1) per item.
    expect(got[0].score).toBeCloseTo(1 / (RRF_K + 1), 8);
    expect(got[1].score).toBeCloseTo(1 / (RRF_K + 2), 8);
  });

  it("merges items by id when they appear in multiple lists", () => {
    const got = fuseRRF([
      {
        name: "vector",
        items: [{ id: "a" }, { id: "b" }],
      },
      {
        name: "lexical",
        items: [{ id: "b" }, { id: "a" }],
      },
    ]);
    // Both 'a' and 'b' appear at rank 0 + rank 1 across the two lists,
    // so fused scores are equal — order between equal-score items is
    // implementation-defined and not asserted.
    const ids = got.map((x) => x.id).sort();
    expect(ids).toEqual(["a", "b"]);
    // Each contributes 1/(k+1) + 1/(k+2)
    const expectedScore = 1 / (RRF_K + 1) + 1 / (RRF_K + 2);
    expect(got[0].score).toBeCloseTo(expectedScore, 8);
    expect(got[1].score).toBeCloseTo(expectedScore, 8);
  });

  it("ranks an item appearing in two lists above an item appearing in one (the core RRF property)", () => {
    const got = fuseRRF([
      {
        name: "vector",
        items: [{ id: "a" }, { id: "b" }],
      },
      {
        name: "lexical",
        items: [{ id: "a" }, { id: "c" }],
      },
    ]);
    expect(got[0].id).toBe("a");
    // 'a' appears in both lists at rank 0 → 2/(k+1)
    // 'b' and 'c' each appear in one list at rank 1 → 1/(k+2)
    expect(got[0].score).toBeCloseTo(2 / (RRF_K + 1), 8);
  });

  it("exposes per-source ranks for provenance", () => {
    const got = fuseRRF([
      {
        name: "vector",
        items: [{ id: "x" }, { id: "y" }],
      },
      {
        name: "lexical",
        items: [{ id: "y" }, { id: "z" }],
      },
    ]);
    const x = got.find((g) => g.id === "x")!;
    const y = got.find((g) => g.id === "y")!;
    const z = got.find((g) => g.id === "z")!;
    // x was in vector list only at rank 0
    expect(x.sources).toEqual({ vector: 0 });
    // y was in both: vector rank 1, lexical rank 0
    expect(y.sources).toEqual({ vector: 1, lexical: 0 });
    // z was in lexical only at rank 1
    expect(z.sources).toEqual({ lexical: 1 });
  });

  it("honors the optional weight per list (lexical bias example)", () => {
    const got = fuseRRF([
      {
        name: "vector",
        items: [{ id: "v_only" }, { id: "shared" }],
        weight: 1,
      },
      {
        name: "lexical",
        items: [{ id: "shared" }, { id: "l_only" }],
        weight: 3, // 3x lexical bias
      },
    ]);
    // 'shared' fused score = 1/(k+2) + 3/(k+1)
    // 'v_only' fused score = 1/(k+1)
    // 'l_only' fused score = 3/(k+2)
    // shared > l_only > v_only by construction
    expect(got[0].id).toBe("shared");
    expect(got.map((g) => g.id)).toEqual(["shared", "l_only", "v_only"]);
  });

  it("respects the optional limit option", () => {
    const got = fuseRRF(
      [
        {
          name: "vector",
          items: [
            { id: "a" },
            { id: "b" },
            { id: "c" },
            { id: "d" },
            { id: "e" },
          ],
        },
      ],
      { limit: 3 },
    );
    expect(got).toHaveLength(3);
    expect(got.map((g) => g.id)).toEqual(["a", "b", "c"]);
  });

  it("honors a custom k value (smaller k = stronger rank-1 dominance)", () => {
    const got1 = fuseRRF(
      [
        {
          name: "vector",
          items: [{ id: "first" }],
        },
      ],
      { k: 1 },
    );
    const got60 = fuseRRF(
      [
        {
          name: "vector",
          items: [{ id: "first" }],
        },
      ],
      { k: 60 },
    );
    // k=1 → 1/(1+1) = 0.5. k=60 → 1/(60+1) = 0.0163
    expect(got1[0].score).toBeCloseTo(0.5, 6);
    expect(got60[0].score).toBeCloseTo(1 / 61, 6);
  });

  it("handles empty lists without crashing", () => {
    expect(fuseRRF([])).toEqual([]);
    expect(fuseRRF([{ name: "vector", items: [] }])).toEqual([]);
  });

  it("ignores items with id collisions across lists by treating them as the same document (the whole point of RRF for hybrid retrieval)", () => {
    // The use case: vector and lexical both surface the same chunkId.
    // Fused result should have one entry per unique chunkId, not two.
    const got = fuseRRF([
      {
        name: "vector",
        items: [{ id: "chunk_42" }],
      },
      {
        name: "lexical",
        items: [{ id: "chunk_42" }],
      },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("chunk_42");
    expect(got[0].sources).toEqual({ vector: 0, lexical: 0 });
  });
});
