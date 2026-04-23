import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emergencyStopResponse, isEmergencyStopped } from "./emergency-stop";

const FLAG = "EMERGENCY_STOP";

describe("isEmergencyStopped", () => {
  const original = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  it("returns false when the flag is unset", () => {
    expect(isEmergencyStopped()).toBe(false);
  });

  it("returns true for '1'", () => {
    process.env[FLAG] = "1";
    expect(isEmergencyStopped()).toBe(true);
  });

  it("returns true for 'true'", () => {
    process.env[FLAG] = "true";
    expect(isEmergencyStopped()).toBe(true);
  });

  it("returns false for any other value (including '0' / 'false' / empty)", () => {
    for (const v of ["0", "false", "", "yes", "on"]) {
      process.env[FLAG] = v;
      expect(isEmergencyStopped(), `value=${JSON.stringify(v)}`).toBe(false);
    }
  });
});

describe("emergencyStopResponse", () => {
  it("returns 503 with EMERGENCY_STOP code and Retry-After", async () => {
    const res = emergencyStopResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("EMERGENCY_STOP");
    expect(body.message).toMatch(/runbook/i);
  });
});
