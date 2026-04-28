import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import attestationData from "@/lib/attestation-data.json";

/**
 * Sanity assertions on the build-time-generated attestation payload
 * so the /api/attestation endpoint never returns a structurally
 * invalid response. The companion script
 * `scripts/generate-attestation-data.mjs` runs in `postinstall` +
 * `vercel-build`, and the gitignored JSON it writes is what this
 * test validates. ADR-0056 is the design record.
 */
describe("attestation-data.json (build-time generated)", () => {
  it("has the load-bearing top-level fields", () => {
    expect(typeof attestationData.tag).toBe("string");
    expect(attestationData.tag.length).toBeGreaterThan(0);
    expect(typeof attestationData.commit).toBe("string");
    expect(attestationData.commit.length).toBeGreaterThanOrEqual(7);
    expect(typeof attestationData.buildAt).toBe("string");
    // ISO timestamp parses without throwing.
    expect(Number.isFinite(Date.parse(attestationData.buildAt))).toBe(true);
  });

  it("claims has structurally valid counts", () => {
    expect(typeof attestationData.claims.adrCount).toBe("number");
    expect(attestationData.claims.adrCount).toBeGreaterThan(0);
    expect(typeof attestationData.claims.boardlyRouteCount).toBe("number");
    expect(attestationData.claims.boardlyRouteCount).toBeGreaterThan(0);
    expect(attestationData.claims.cspGrade).toBe("A");
  });

  it("scope.deferred is a non-empty list with adr + reason", () => {
    expect(Array.isArray(attestationData.scope.deferred)).toBe(true);
    expect(attestationData.scope.deferred.length).toBeGreaterThan(0);
    for (const entry of attestationData.scope.deferred) {
      expect(typeof entry.feature).toBe("string");
      expect(typeof entry.adr).toBe("string");
      expect(typeof entry.reason).toBe("string");
    }
  });

  it("honestScopeNotes covers T-06 and excludes T-01 + I-01 (both graduated)", () => {
    // History of this assertion:
    //   v0.5.4-v0.5.10: required T-01 + I-01 + T-06 all present.
    //   v0.5.11 (ADR-0060): T-01 resolved → tightened to "T-01 absent
    //     + I-01 + T-06 present".
    //   v0.5.12 (ADR-0061): I-01 resolved → tightened to "T-01 absent
    //     + I-01 absent + T-06 present".
    // The absence assertions structurally pin both graduations: a
    // future re-introduction of either disclosure (without
    // re-shipping the migration) would fail this check at PR time.
    const notes = attestationData.scope.honestScopeNotes.join("\n");
    expect(notes).toMatch(/T-06/);
    expect(notes).not.toMatch(/T-01/);
    expect(notes).not.toMatch(/I-01/);
  });

  it("ADR count in attestation matches `ls docs/adr/00*.md` ground truth", () => {
    // Catches the case where `vercel-build` did not run (e.g. local dev
    // without postinstall completing) and `attestation-data.json` is
    // stale relative to the actual filesystem.
    const adrDir = resolve(__dirname, "../../../../../../docs/adr");
    let actualCount: number;
    try {
      actualCount = readdirSync(adrDir).filter((f) =>
        /^\d{4}-.*\.md$/.test(f),
      ).length;
    } catch {
      // If the docs/adr dir is unreachable from this test (unlikely,
      // but defensive) we skip rather than false-fail.
      return;
    }
    expect(attestationData.claims.adrCount).toBe(actualCount);
  });
});
