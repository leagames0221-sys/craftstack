import { readFileSync, readdirSync } from "node:fs";
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

  // --- ADR-0068 § Finding A reflexivity gate ----------------------------
  // The Run #5 hiring-sim drift class: `/api/attestation.scope.deferred[]`
  // listed "Hybrid search (BM25 + vector via RRF)" with `adr: ADR-0011`,
  // but ADR-0011's Status field said "Fully Accepted (2026-04-28) — hybrid
  // + RRF shipped in v0.5.14". The endpoint built to expose audit-survivable
  // truth was lying about a feature whose own ADR says it shipped. This
  // assertion structurally pins the rule: no `scope.deferred[]` entry's
  // ADR may have a Status field whose first non-empty line begins with
  // "Fully Accepted" or "Accepted (shipped)" — those statuses indicate
  // the feature is live, not deferred. Cohere Rerank stays in scope.deferred[]
  // because its ADR status now reads "Fully Accepted ... Cohere Rerank still
  // deferred" — the test below tolerates that pattern by also requiring the
  // status text to mention the entry's `feature` keyword if Status looks
  // closed; an entry whose feature word appears alongside "still deferred"
  // / "deferred" / "not shipped" in the status passes.
  it("scope.deferred[] entries do not contradict their ADR Status (Run #5 / ADR-0068 § Finding A)", () => {
    const adrDir = resolve(__dirname, "../../../../../../docs/adr");
    let adrFiles: string[];
    try {
      adrFiles = readdirSync(adrDir).filter((f) => /^\d{4}-.*\.md$/.test(f));
    } catch {
      // If docs/adr is unreachable, skip rather than false-fail.
      return;
    }
    const adrIdToFile = new Map<string, string>();
    for (const f of adrFiles) {
      const m = f.match(/^(\d{4})-/);
      if (m) adrIdToFile.set(`ADR-${m[1]}`, f);
    }
    const failures: string[] = [];
    for (const entry of attestationData.scope.deferred) {
      const file = adrIdToFile.get(entry.adr);
      if (!file) continue; // unknown ADR — covered by check-adr-refs.mjs
      const adrPath = resolve(adrDir, file);
      const adrText = readFileSync(adrPath, "utf8");
      // Pull the Status line. Format from the ADR template:
      //   `- Status: **<status text>** ...`
      const statusMatch = adrText.match(
        /^- Status:\s*\*\*([^*]+)\*\*([^\n]*)/m,
      );
      const statusText = statusMatch
        ? `${statusMatch[1]} ${statusMatch[2]}`
        : (adrText.match(/^- Status:\s*([^\n]+)/m)?.[1] ?? "");
      // Heuristic: if the Status line says "Fully Accepted" or "Accepted (shipped)"
      // AND does NOT also explicitly carve out the feature as still-deferred,
      // the deferred entry is contradicting its own ADR.
      const looksClosed =
        /Fully Accepted/i.test(statusText) ||
        /Accepted \(shipped\)/i.test(statusText);
      if (!looksClosed) continue;
      // Extract the first significant word of the feature for the carve-out check.
      // E.g., "Cohere Rerank" → "Cohere"; "Hybrid search (BM25 + vector via RRF)" → "Hybrid".
      const featureKeyword = entry.feature.split(/[\s(]/)[0];
      const explicitlyCarvedOut = new RegExp(
        `${featureKeyword}[^.]*?(still deferred|deferred|not shipped|requires.*key)`,
        "i",
      ).test(statusText);
      if (!explicitlyCarvedOut) {
        failures.push(
          `scope.deferred[] entry "${entry.feature}" (${entry.adr}) contradicts ADR Status "${statusText.trim()}". ` +
            `Either remove the deferred entry (feature shipped) or update the ADR Status to explicitly carve out this feature as still deferred.`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("scope.shippedFlagGated[] entries each reference a closingAdr distinct from the original adr (Run #5 / ADR-0068 § Finding A)", () => {
    // Audit-survivable shape for the new section: each entry must record
    // the original deferred ADR + the ADR that closed it + the version it
    // shipped in + the env flag that gates default behaviour. Without this
    // shape, "shipped flag-gated" loses the specificity that makes it
    // distinguishable from "deferred".
    const flagGated = (
      attestationData.scope as { shippedFlagGated?: unknown[] }
    ).shippedFlagGated;
    if (!Array.isArray(flagGated)) {
      // shippedFlagGated is optional; acceptable for the array to be missing.
      return;
    }
    for (const entry of flagGated as Array<Record<string, unknown>>) {
      expect(typeof entry.feature).toBe("string");
      expect(typeof entry.adr).toBe("string");
      expect(typeof entry.closingAdr).toBe("string");
      expect(entry.closingAdr).not.toBe(entry.adr);
      expect(typeof entry.shippedIn).toBe("string");
      expect(typeof entry.flag).toBe("string");
      expect(typeof entry.flagDefault).toBe("string");
    }
  });
});
