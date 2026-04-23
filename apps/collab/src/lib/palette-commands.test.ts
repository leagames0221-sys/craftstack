import { describe, expect, it } from "vitest";
import {
  PALETTE_ACTIONS,
  extractActionQuery,
  filterActions,
} from "./palette-commands";

describe("filterActions", () => {
  it("returns the full list when the query is empty or whitespace", () => {
    expect(filterActions(PALETTE_ACTIONS, "")).toEqual(PALETTE_ACTIONS);
    expect(filterActions(PALETTE_ACTIONS, "   ")).toEqual(PALETTE_ACTIONS);
  });

  it("matches the label case-insensitively", () => {
    const hit = filterActions(PALETTE_ACTIONS, "SIGN");
    expect(hit.map((a) => a.id)).toEqual(["auth.signout"]);
  });

  it("matches via the keywords list so synonyms work", () => {
    const hit = filterActions(PALETTE_ACTIONS, "logout");
    expect(hit.map((a) => a.id)).toEqual(["auth.signout"]);
  });

  it("matches partial hint text", () => {
    const hit = filterActions(PALETTE_ACTIONS, "brand-new");
    expect(hit.map((a) => a.id)).toEqual(["workspace.new"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterActions(PALETTE_ACTIONS, "nonexistent-token")).toEqual([]);
  });
});

describe("extractActionQuery", () => {
  it("returns null when the input does not start with >", () => {
    expect(extractActionQuery("foo")).toBeNull();
    expect(extractActionQuery(" >foo")).toBeNull();
  });

  it("strips the > prefix and leading whitespace", () => {
    expect(extractActionQuery(">")).toBe("");
    expect(extractActionQuery(">  new")).toBe("new");
    expect(extractActionQuery(">sign out")).toBe("sign out");
  });
});
