import { describe, expect, it } from "vitest";
import { between, compare, first, last } from "./lexorank";

describe("lexorank helper", () => {
  it("first() produces a rank sortable before last()", () => {
    expect(compare(first(), last())).toBeLessThan(0);
  });

  it("between(first, last) returns a rank strictly between them", () => {
    const a = first();
    const b = last();
    const mid = between(a, b);
    expect(compare(a, mid)).toBeLessThan(0);
    expect(compare(mid, b)).toBeLessThan(0);
  });

  it("between(null, null) yields a valid rank", () => {
    const r = between(null, null);
    expect(typeof r).toBe("string");
    expect(r.length).toBeGreaterThan(0);
  });

  it("between(prev, undefined) places after prev", () => {
    const prev = first();
    const after = between(prev);
    expect(compare(prev, after)).toBeLessThan(0);
  });

  it("between(undefined, next) places before next", () => {
    const next = last();
    const before = between(undefined, next);
    expect(compare(before, next)).toBeLessThan(0);
  });

  it("repeated insertions remain strictly ordered", () => {
    const start = first();
    const end = last();
    const r1 = between(start, end);
    const r2 = between(start, r1);
    const r3 = between(r2, r1);
    const ordered = [start, r2, r3, r1, end];
    const sorted = [...ordered].sort(compare);
    expect(sorted).toEqual(ordered);
  });

  it("compare is antisymmetric", () => {
    const a = first();
    const b = last();
    expect(Math.sign(compare(a, b))).toBe(-Math.sign(compare(b, a)));
  });
});
