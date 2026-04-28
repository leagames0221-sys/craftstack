import { describe, expect, it } from "vitest";

import { ALLOWED_E2E_EMAILS, e2eGateOpen } from "./config";

/**
 * Unit tests for the CI-only Credentials provider gate (ADR-0065,
 * mirrors apps/collab ADR-0038). Verifies the triple-gate predicate
 * `e2eGateOpen` returns the structurally correct boolean for every
 * environment shape — load-bearing because a false-positive (gate
 * opening on Vercel) would re-open the cost-attack vector ADR-0061
 * closed by requiring auth on writes.
 *
 * The provider's `authorize()` callback is exercised end-to-end via
 * the calibration run + (future) authed Playwright suite for Knowlex,
 * matching the apps/collab pattern from ADR-0038.
 */

describe("e2eGateOpen — Credentials provider gate predicate (ADR-0065)", () => {
  it("returns false when VERCEL=1 (mechanically excludes every Vercel-hosted deploy)", () => {
    expect(
      e2eGateOpen({
        VERCEL: "1",
        E2E_ENABLED: "1",
        E2E_SHARED_SECRET: "x".repeat(32),
      }),
    ).toBe(false);
  });

  it("returns false when E2E_ENABLED is unset (default-off discipline)", () => {
    expect(e2eGateOpen({ E2E_SHARED_SECRET: "x".repeat(32) })).toBe(false);
  });

  it("returns false when E2E_ENABLED is 'true' rather than '1' (string identity, not truthiness)", () => {
    expect(
      e2eGateOpen({
        E2E_ENABLED: "true",
        E2E_SHARED_SECRET: "x".repeat(32),
      }),
    ).toBe(false);
  });

  it("returns false when E2E_SHARED_SECRET is unset", () => {
    expect(e2eGateOpen({ E2E_ENABLED: "1" })).toBe(false);
  });

  it("returns false when E2E_SHARED_SECRET is shorter than 16 bytes", () => {
    expect(
      e2eGateOpen({
        E2E_ENABLED: "1",
        E2E_SHARED_SECRET: "x".repeat(15),
      }),
    ).toBe(false);
  });

  it("returns true ONLY when all three conditions hold (VERCEL!=1 + E2E_ENABLED=1 + secret>=16)", () => {
    expect(
      e2eGateOpen({
        E2E_ENABLED: "1",
        E2E_SHARED_SECRET: "x".repeat(16),
      }),
    ).toBe(true);
  });

  it("returns false even with everything else green when VERCEL=1 (gate ordering is load-bearing)", () => {
    // Same shape as the green-gate test above but VERCEL forced to "1".
    // Pinning this case ensures a refactor that moves the VERCEL check
    // late in the chain still fails this test if the early-exit semantics
    // are lost.
    expect(
      e2eGateOpen({
        VERCEL: "1",
        E2E_ENABLED: "1",
        E2E_SHARED_SECRET: "x".repeat(16),
      }),
    ).toBe(false);
  });
});

describe("ALLOWED_E2E_EMAILS — allowlist contents", () => {
  it("contains exactly the three E2E identities used by the auth-suite + calibration eval", () => {
    expect(ALLOWED_E2E_EMAILS.size).toBe(3);
    expect(ALLOWED_E2E_EMAILS.has("e2e+owner@e2e.example")).toBe(true);
    expect(ALLOWED_E2E_EMAILS.has("e2e+editor@e2e.example")).toBe(true);
    expect(ALLOWED_E2E_EMAILS.has("e2e+viewer@e2e.example")).toBe(true);
  });

  it("rejects look-alike emails (different domain, prefix variant, casing)", () => {
    expect(ALLOWED_E2E_EMAILS.has("e2e+owner@example.com")).toBe(false);
    expect(ALLOWED_E2E_EMAILS.has("E2E+owner@e2e.example")).toBe(false);
    expect(ALLOWED_E2E_EMAILS.has("e2e+admin@e2e.example")).toBe(false);
    expect(ALLOWED_E2E_EMAILS.has("user+owner@e2e.example")).toBe(false);
  });
});
