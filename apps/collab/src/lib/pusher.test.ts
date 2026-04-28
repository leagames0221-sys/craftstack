import { describe, expect, it } from "vitest";
import { boardChannelName, parseBoardChannel } from "./pusher";

// These two helpers (ADR-0060) are the contract surface between three
// independent files: server-side `broadcastBoard()`, browser-side
// `BoardClient.tsx` subscribe, and the `/api/pusher/auth` route's allow-list.
// If they drift, the realtime fanout silently breaks (server emits to one
// channel, client subscribes to another, auth route refuses both). These
// tests pin the shape so a drift fails at PR time.

describe("boardChannelName", () => {
  it("prefixes private-board- to the boardId", () => {
    expect(boardChannelName("abc123")).toBe("private-board-abc123");
  });

  it("preserves the exact boardId (no encoding / mutation)", () => {
    expect(boardChannelName("clp_some-cuid_v1")).toBe(
      "private-board-clp_some-cuid_v1",
    );
  });
});

describe("parseBoardChannel (auth-route allow-list)", () => {
  it("accepts the canonical private-board-<id> shape and returns the boardId", () => {
    expect(parseBoardChannel("private-board-abc123")).toBe("abc123");
    expect(parseBoardChannel("private-board-clp_some-cuid_v1")).toBe(
      "clp_some-cuid_v1",
    );
  });

  it("round-trips with boardChannelName", () => {
    const id = "ckxyz_42-Q";
    expect(parseBoardChannel(boardChannelName(id))).toBe(id);
  });

  it("rejects the legacy public-channel shape (the v0.5.10-and-earlier name)", () => {
    expect(parseBoardChannel("board-abc123")).toBeNull();
  });

  it("rejects unrelated private-* channels (auth route must not be a generic Pusher signing oracle)", () => {
    expect(parseBoardChannel("private-foo-abc")).toBeNull();
    expect(parseBoardChannel("private-presence-board-abc")).toBeNull();
    expect(parseBoardChannel("private-")).toBeNull();
  });

  it("rejects channel names containing channel-separator characters (smuggling defence)", () => {
    expect(parseBoardChannel("private-board-x.private-board-y")).toBeNull();
    expect(parseBoardChannel("private-board-x;y")).toBeNull();
    expect(parseBoardChannel("private-board-x/y")).toBeNull();
    expect(parseBoardChannel("private-board-x y")).toBeNull();
  });

  it("rejects empty boardId", () => {
    expect(parseBoardChannel("private-board-")).toBeNull();
  });
});
