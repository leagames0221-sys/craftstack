import { describe, expect, it } from "vitest";
import { extractMentionHandles } from "./mentions";

describe("extractMentionHandles", () => {
  it("returns [] for plain text", () => {
    expect(extractMentionHandles("hello there")).toEqual([]);
  });

  it("picks a single @handle", () => {
    expect(extractMentionHandles("hi @alice")).toEqual(["alice"]);
  });

  it("does not match email addresses mid-word", () => {
    expect(extractMentionHandles("contact me at alice@example.com")).toEqual(
      [],
    );
  });

  it("matches at start-of-line", () => {
    expect(extractMentionHandles("@bob please review")).toEqual(["bob"]);
  });

  it("deduplicates and lowercases", () => {
    expect(
      extractMentionHandles("@Alice and @ALICE again, also @alice"),
    ).toEqual(["alice"]);
  });

  it("supports dots and hyphens in handles", () => {
    expect(extractMentionHandles("ping @alice.brown and @bob-smith")).toEqual([
      "alice.brown",
      "bob-smith",
    ]);
  });

  it("ignores handles shorter than 2 chars", () => {
    expect(extractMentionHandles("@a hi")).toEqual([]);
  });
});
