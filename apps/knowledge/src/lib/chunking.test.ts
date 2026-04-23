import { describe, expect, it } from "vitest";

import { approximateTokens, chunkText } from "./chunking";

describe("approximateTokens", () => {
  it("returns ceil(len/4)", () => {
    expect(approximateTokens("")).toBe(0);
    expect(approximateTokens("abcd")).toBe(1);
    expect(approximateTokens("abcde")).toBe(2);
  });
});

describe("chunkText", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  \n  ")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const out = chunkText("Boardly has 160 Vitest cases.");
    expect(out).toHaveLength(1);
    expect(out[0].ordinal).toBe(0);
    expect(out[0].content).toBe("Boardly has 160 Vitest cases.");
  });

  it("splits at paragraph boundaries when possible", () => {
    const input = Array.from({ length: 5 }, (_, i) =>
      `Paragraph ${i + 1}.`.padEnd(200, "x"),
    ).join("\n\n");
    const out = chunkText(input, { maxChars: 400, overlap: 50 });
    expect(out.length).toBeGreaterThan(1);
    // Each chunk fits under maxChars (with a small overage tolerance
    // for the paragraph-join separator).
    for (const c of out) {
      expect(c.content.length).toBeLessThanOrEqual(420);
    }
  });

  it("hard-splits a single paragraph longer than maxChars with overlap", () => {
    const long = "x".repeat(2000);
    const out = chunkText(long, { maxChars: 512, overlap: 80 });
    expect(out.length).toBeGreaterThan(3);
    // Overlap: each next chunk should start with the tail of the prev.
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1].content;
      const curr = out[i].content;
      const tail = prev.slice(-80);
      expect(curr.startsWith(tail)).toBe(true);
    }
  });

  it("ordinals are zero-based and contiguous", () => {
    const input = Array.from({ length: 6 }, () => "x".repeat(300)).join("\n\n");
    const out = chunkText(input, { maxChars: 500, overlap: 50 });
    expect(out.map((c) => c.ordinal)).toEqual(
      Array.from({ length: out.length }, (_, i) => i),
    );
  });
});
