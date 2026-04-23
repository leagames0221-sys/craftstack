import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetCapturesForTests,
  captureError,
  recentCaptures,
} from "./observability";

beforeEach(() => {
  _resetCapturesForTests();
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
});

describe("observability", () => {
  it("records an Error in the ring buffer", async () => {
    await captureError(new Error("boom"), { route: "/test" });
    const captures = recentCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      kind: "error",
      message: "boom",
      name: "Error",
      sourceRoute: "/test",
      backend: "memory",
    });
    expect(typeof captures[0].ts).toBe("string");
  });

  it("records a string payload as a message-shaped capture", async () => {
    await captureError("plain string");
    expect(recentCaptures()[0].message).toBe("plain string");
  });

  it("caps the ring buffer at the documented maximum", async () => {
    for (let i = 0; i < 60; i++) {
      await captureError(new Error(`err-${i}`));
    }
    const captures = recentCaptures();
    expect(captures.length).toBeLessThanOrEqual(50);
    // Ring is reversed on read; the last error in should be first out.
    expect(captures[0].message).toBe("err-59");
  });

  it("returns a defensive copy so callers cannot mutate the ring", async () => {
    await captureError(new Error("a"));
    const snap = recentCaptures();
    snap.length = 0;
    expect(recentCaptures()).toHaveLength(1);
  });

  it("never throws even when the payload is exotic", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    // Should not reject even though JSON.stringify would throw.
    await expect(captureError(cyclic)).resolves.toBeUndefined();
  });
});
