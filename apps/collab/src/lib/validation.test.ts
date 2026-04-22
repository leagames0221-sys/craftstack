import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { parseCreateWorkspaceInput } from "./validation";

describe("parseCreateWorkspaceInput", () => {
  it("accepts a minimal valid body", () => {
    const r = parseCreateWorkspaceInput({ name: "Demo", slug: "demo-team" });
    expect(r).toEqual({ name: "Demo", slug: "demo-team", color: undefined });
  });

  it("accepts a valid color", () => {
    const r = parseCreateWorkspaceInput({
      name: "Demo",
      slug: "demo-team",
      color: "#112233",
    });
    expect(r.color).toBe("#112233");
  });

  it("rejects a non-object body", () => {
    expect(() => parseCreateWorkspaceInput(null)).toThrow(ApiError);
    expect(() => parseCreateWorkspaceInput("hello")).toThrow(ApiError);
  });

  it("rejects invalid slug characters", () => {
    try {
      parseCreateWorkspaceInput({ name: "x", slug: "Bad_Slug" });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.status).toBe(400);
      expect(
        (e.details as { fieldErrors: Record<string, string> }).fieldErrors.slug,
      ).toMatch(/slug must be/);
    }
  });

  it("rejects missing name", () => {
    try {
      parseCreateWorkspaceInput({ slug: "abc" });
      throw new Error("expected to throw");
    } catch (err) {
      const e = err as ApiError;
      expect(
        (e.details as { fieldErrors: Record<string, string> }).fieldErrors.name,
      ).toBeDefined();
    }
  });

  it("rejects overlong name", () => {
    const longName = "x".repeat(81);
    expect(() =>
      parseCreateWorkspaceInput({ name: longName, slug: "abc" }),
    ).toThrow(ApiError);
  });

  it("rejects malformed color", () => {
    expect(() =>
      parseCreateWorkspaceInput({ name: "x", slug: "abc", color: "red" }),
    ).toThrow(ApiError);
  });

  it("lowercases and trims the slug", () => {
    const r = parseCreateWorkspaceInput({
      name: "Demo",
      slug: "  Demo-Team  ",
    });
    expect(r.slug).toBe("demo-team");
  });
});
