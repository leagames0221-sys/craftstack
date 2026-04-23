import { beforeEach, describe, expect, it } from "vitest";
import { _config, _resetForTests, checkAndIncrement } from "./kb-rate-limit";

beforeEach(() => _resetForTests());

describe("checkAndIncrement", () => {
  it("allows up to MAX_PER_WINDOW calls from one IP", () => {
    const now = 1_000_000;
    for (let i = 0; i < _config.MAX_PER_WINDOW; i++) {
      const r = checkAndIncrement("1.2.3.4", now + i);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects the next call once the window is saturated", () => {
    const now = 1_000_000;
    for (let i = 0; i < _config.MAX_PER_WINDOW; i++) {
      checkAndIncrement("1.2.3.4", now + i);
    }
    const r = checkAndIncrement("1.2.3.4", now + _config.MAX_PER_WINDOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterSeconds).toBeGreaterThan(0);
      expect(r.retryAfterSeconds).toBeLessThanOrEqual(
        Math.ceil(_config.WINDOW_MS / 1000),
      );
    }
  });

  it("resets once the window has elapsed", () => {
    const now = 1_000_000;
    for (let i = 0; i < _config.MAX_PER_WINDOW; i++) {
      checkAndIncrement("1.2.3.4", now + i);
    }
    const past = now + _config.WINDOW_MS + 1;
    const r = checkAndIncrement("1.2.3.4", past);
    expect(r.ok).toBe(true);
  });

  it("tracks different IPs independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < _config.MAX_PER_WINDOW; i++) {
      checkAndIncrement("1.2.3.4", now + i);
    }
    const r = checkAndIncrement("5.6.7.8", now + _config.MAX_PER_WINDOW);
    expect(r.ok).toBe(true);
  });
});
