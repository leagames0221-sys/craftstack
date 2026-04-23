import { beforeEach, describe, expect, it } from "vitest";

import { _resetUserLimitForTests, checkUserLimit } from "./user-rate-limit";

beforeEach(() => _resetUserLimitForTests());

describe("checkUserLimit", () => {
  it("allows up to cap calls within the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const r = checkUserLimit("search", "u1", 60_000, 5, now + i);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects the next call with retryAfter > 0", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkUserLimit("search", "u1", 60_000, 5, now);
    const r = checkUserLimit("search", "u1", 60_000, 5, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("separates users", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkUserLimit("search", "u1", 60_000, 5, now);
    const r = checkUserLimit("search", "u2", 60_000, 5, now);
    expect(r.ok).toBe(true);
  });

  it("separates namespaces", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkUserLimit("search", "u1", 60_000, 5, now);
    const r = checkUserLimit("notifications", "u1", 60_000, 5, now);
    expect(r.ok).toBe(true);
  });

  it("resets after the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkUserLimit("search", "u1", 60_000, 5, now);
    const past = now + 60_000 + 1;
    const r = checkUserLimit("search", "u1", 60_000, 5, past);
    expect(r.ok).toBe(true);
  });
});
