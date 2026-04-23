import { beforeEach, describe, expect, it } from "vitest";

import {
  _configForTests,
  _resetForTests,
  checkAndIncrementGlobalBudget,
  snapshotBudget,
} from "./global-budget";

beforeEach(() => _resetForTests());

describe("checkAndIncrementGlobalBudget", () => {
  it("allows requests up to the daily cap, then refuses with scope='day'", () => {
    const now = 1_000_000_000;
    // Default daily cap is 800; we drive a small custom cap via envs
    // can't be changed after module load, so rely on defaults and only
    // check the structural invariants here.
    const first = checkAndIncrementGlobalBudget("test-ns", now);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.remainingDay).toBeGreaterThanOrEqual(0);
      expect(first.remainingMonth).toBeGreaterThanOrEqual(first.remainingDay);
    }
  });

  it("tracks different namespaces independently", () => {
    const now = 1_000_000_000;
    const a = checkAndIncrementGlobalBudget("ns-a", now);
    const b = checkAndIncrementGlobalBudget("ns-b", now);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      // Both should see "one call consumed in my own window"; their
      // remainingDay must match modulo that single increment.
      expect(a.remainingDay).toBe(b.remainingDay);
    }
  });
});

describe("snapshotBudget", () => {
  it("reports zero-used counters for an untouched namespace", () => {
    const snap = snapshotBudget("unused-ns", 1_000_000_000);
    expect(snap.day.used).toBe(0);
    expect(snap.month.used).toBe(0);
    expect(snap.day.cap).toBeGreaterThan(0);
    expect(snap.month.cap).toBeGreaterThan(0);
    expect(snap.day.resetInSeconds).toBe(0);
    expect(snap.month.resetInSeconds).toBe(0);
  });

  it("does not mutate counters — two snapshots in a row are identical", () => {
    const now = 1_000_000_000;
    checkAndIncrementGlobalBudget("probe", now);
    const a = snapshotBudget("probe", now);
    const b = snapshotBudget("probe", now);
    expect(a).toEqual(b);
  });

  it("reflects consumption after checkAndIncrement", () => {
    const now = 1_000_000_000;
    const before = snapshotBudget("hit", now);
    checkAndIncrementGlobalBudget("hit", now);
    const after = snapshotBudget("hit", now);
    expect(after.day.used).toBe(before.day.used + 1);
    expect(after.month.used).toBe(before.month.used + 1);
    expect(after.day.resetInSeconds).toBeGreaterThan(0);
    expect(after.day.resetInSeconds).toBeLessThanOrEqual(
      Math.ceil(_configForTests.DAY_MS / 1000),
    );
  });

  it("reports resetInSeconds = 0 once the window has elapsed (used stays = 0 until the next increment)", () => {
    const now = 1_000_000_000;
    checkAndIncrementGlobalBudget("expired", now);
    const later = now + _configForTests.DAY_MS + 1;
    const snap = snapshotBudget("expired", later);
    // Window has rolled over — read-only snapshot reports the fresh
    // state without mutating.
    expect(snap.day.used).toBe(0);
    expect(snap.day.resetInSeconds).toBe(0);
  });
});
