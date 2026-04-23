import { beforeEach, describe, expect, it } from "vitest";

import { _resetForTests, checkAndIncrementGlobalBudget } from "./global-budget";

beforeEach(() => _resetForTests());

describe("checkAndIncrementGlobalBudget", () => {
  it("allows traffic below the day cap", () => {
    for (let i = 0; i < 5; i++) {
      const r = checkAndIncrementGlobalBudget("kb");
      expect(r.ok).toBe(true);
    }
  });

  it("rejects with scope=day when the day cap trips", () => {
    // Force the cap low via env override.
    process.env.KB_BUDGET_PER_DAY = "3";
    process.env.KB_BUDGET_PER_MONTH = "9999";
    try {
      for (let i = 0; i < 3; i++) checkAndIncrementGlobalBudget("kb");
      const r = checkAndIncrementGlobalBudget("kb");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.scope).toBe("day");
        expect(r.retryAfterSeconds).toBeGreaterThan(0);
      }
    } finally {
      delete process.env.KB_BUDGET_PER_DAY;
      delete process.env.KB_BUDGET_PER_MONTH;
    }
  });

  it("rejects with scope=month when month cap trips before day", () => {
    process.env.KB_BUDGET_PER_DAY = "9999";
    process.env.KB_BUDGET_PER_MONTH = "2";
    try {
      checkAndIncrementGlobalBudget("kb");
      checkAndIncrementGlobalBudget("kb");
      const r = checkAndIncrementGlobalBudget("kb");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.scope).toBe("month");
      }
    } finally {
      delete process.env.KB_BUDGET_PER_DAY;
      delete process.env.KB_BUDGET_PER_MONTH;
    }
  });

  it("isolates namespaces — different endpoints don't share the counter", () => {
    process.env.KB_BUDGET_PER_DAY = "1";
    try {
      const a = checkAndIncrementGlobalBudget("kb");
      const b = checkAndIncrementGlobalBudget("search");
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
    } finally {
      delete process.env.KB_BUDGET_PER_DAY;
    }
  });
});
