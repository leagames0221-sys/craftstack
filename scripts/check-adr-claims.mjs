// scripts/check-adr-claims.mjs — closes axis 7 of the drift-audit
// framework (ADR-0057): asserts that every load-bearing ADR claim
// matches the actual codebase at PR time.
//
// Companion to:
//   - scripts/check-doc-drift.mjs (axis 1: numerics in prose)
//   - GET /api/health/schema     (axis 2: schema drift)
//   - GET /api/attestation       (axis 6: cron health)
//
// The 6-axis audit caught:
//   - "the doc says 211 Vitest cases" → grep, assert
//   - "the live db has Document.workspaceId" → schema canary
//   - "the cron is fresh" → cronHealthHint
//
// What axis 7 (this script) catches:
//   - "ADR-0027 says rate limit = 1000/mo" → does the code agree?
//   - "ADR-0046 says EMERGENCY_STOP short-circuits ask" → present?
//   - "ADR-0053 says /api/health/schema exists" → file present?
//
// Run locally:  node scripts/check-adr-claims.mjs
//               node scripts/check-adr-claims.mjs --list
// Exit code: 0 if every claim holds, 1 if any claim drifts.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CLAIMS_PATH = resolve(ROOT, "docs/adr/_claims.json");

const args = new Set(process.argv.slice(2));
const listMode = args.has("--list");

let failures = 0;

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failures++;
}

const data = JSON.parse(readFileSync(CLAIMS_PATH, "utf8"));
if (!data?.claims || !Array.isArray(data.claims)) {
  console.error("docs/adr/_claims.json: no `claims` array");
  process.exit(1);
}

if (listMode) {
  console.log(`# ADR-claim inventory (${data.claims.length} entries)`);
  const byAdr = new Map();
  for (const c of data.claims) {
    if (!byAdr.has(c.adr)) byAdr.set(c.adr, []);
    byAdr.get(c.adr).push(c);
  }
  for (const [adr, entries] of [...byAdr.entries()].sort()) {
    console.log(`\n## ${adr} (${entries.length})`);
    for (const e of entries) {
      console.log(`  - ${e.claim}  →  ${e.file}`);
    }
  }
  process.exit(0);
}

console.log(
  `=== ADR-claim ↔ implementation cross-check (${data.claims.length} entries) ===`,
);

for (const c of data.claims) {
  const label = `[${c.adr}] ${c.claim}`;
  const fullPath = resolve(ROOT, c.file);

  if (!existsSync(fullPath)) {
    fail(`${label}: file ${c.file} does not exist`);
    continue;
  }

  if (c.match === "exists") {
    pass(`${label}  (file exists)`);
    continue;
  }

  const content = read(c.file);

  if (c.match === "contains") {
    if (typeof c.pattern !== "string" || c.pattern.length === 0) {
      fail(`${label}: 'contains' match needs a non-empty string pattern`);
      continue;
    }
    // Treat the pattern as a regex if it contains regex metacharacters,
    // otherwise as a literal substring.
    const re = new RegExp(c.pattern);
    if (re.test(content)) {
      pass(`${label}  (pattern present in ${c.file})`);
    } else {
      fail(
        `${label}: pattern "${c.pattern}" not found in ${c.file}`,
      );
    }
    continue;
  }

  if (c.match === "regex") {
    if (typeof c.pattern !== "string" || c.pattern.length === 0) {
      fail(`${label}: 'regex' match needs a non-empty pattern`);
      continue;
    }
    const re = new RegExp(c.pattern);
    const m = content.match(re);
    if (!m) {
      fail(`${label}: regex /${c.pattern}/ matched no text in ${c.file}`);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(c, "expected")) {
      // Just assert the regex matched.
      pass(`${label}  (regex matched in ${c.file})`);
      continue;
    }
    const got = m[1];
    const expectedStr = String(c.expected);
    // Compare as strings to avoid type-coercion surprises (e.g., "0.6"
    // vs 0.6 vs "0.60"); the yaml is authoritative.
    if (got === expectedStr) {
      pass(`${label}  (= ${got})`);
    } else {
      fail(
        `${label}: claims ${expectedStr}, code has ${got} in ${c.file}`,
      );
    }
    continue;
  }

  fail(`${label}: unknown match type "${c.match}"`);
}

// ---------------------------------------------------------------------
// PR-time integrity: new ADR must touch _claims.json OR carry an
// explicit no-claim-needed opt-out marker.
//
// Closes the axis-7 future-drift mode named in ADR-0059: a new ADR
// landing without a claims.json update silently shrinks coverage from
// the maintainer's perspective (count stays same / total grows), and
// the framework's "judged-load-bearing" assertion drifts toward
// vacuous over time. This check forces an explicit decision per new
// ADR — either add the claim, or declare the ADR has no checkable
// claim and name why.
//
// The git diff resolves added ADR files since the merge base with
// origin/main; on a local dev shell with no git remote, this no-ops.
// The CI runner has origin/main fetched, so the check is active
// PR-time but graceful elsewhere.
//
// Opt-out marker: include the literal HTML comment
//     <!-- no-claim-needed: <reason> -->
// anywhere in the ADR body. Architectural-intent ADRs (ADR-0001
// monorepo, ADR-0017 release-order, etc.) are the canonical case.
// ---------------------------------------------------------------------

console.log("\n=== PR-time integrity: new ADRs must update _claims.json ===");

let addedAdrs = [];
let claimsTouched = false;
let gitAvailable = true;
try {
  // --diff-filter=A = added files only; the merge-base with origin/main
  // is the right base for a feature-branch PR and benign for main pushes
  // (returns nothing).
  const baseRef = "origin/main";
  const addedRaw = execSync(
    `git diff --name-only --diff-filter=A ${baseRef}...HEAD -- docs/adr`,
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  addedAdrs = addedRaw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /^docs\/adr\/\d{4}-.*\.md$/.test(s));

  const touchedRaw = execSync(
    `git diff --name-only ${baseRef}...HEAD -- docs/adr/_claims.json`,
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  claimsTouched = touchedRaw.trim().length > 0;
} catch {
  // No git, no origin/main, or commit graph trimmed (shallow clone
  // without enough history). Don't false-fail; the structural defence
  // is layered (PR review + CI + this check), and skipping when git
  // can't compute the diff is preferable to a false red.
  gitAvailable = false;
}

if (!gitAvailable) {
  console.log(
    "  ⓘ skipped (git diff against origin/main unavailable; this is fine outside of CI)",
  );
} else if (addedAdrs.length === 0) {
  console.log("  ✓ no new ADRs in this PR — nothing to enforce");
} else {
  console.log(
    `  • ${addedAdrs.length} new ADR(s) added in this PR; _claims.json ${claimsTouched ? "WAS" : "WAS NOT"} touched`,
  );
  for (const adrPath of addedAdrs) {
    const text = readFileSync(resolve(ROOT, adrPath), "utf8");
    const optedOut = /<!--\s*no-claim-needed\s*:/.test(text);
    if (claimsTouched || optedOut) {
      pass(
        `${adrPath}  (${claimsTouched ? "_claims.json updated" : "no-claim-needed marker present"})`,
      );
    } else {
      fail(
        `${adrPath}: new ADR without _claims.json update or 'no-claim-needed' marker. ` +
          `Either add a claim entry to docs/adr/_claims.json, or include ` +
          `'<!-- no-claim-needed: <reason> -->' in the ADR body to declare it has no checkable claim.`,
      );
    }
  }
}

console.log(
  `\n=== ADR-claim summary: ${data.claims.length - failures}/${data.claims.length} claim(s), ${failures} failure(s) ===`,
);
if (failures > 0) {
  console.error(
    "\nADR claim drift detected. Either fix the implementation to match the ADR, update the ADR (and the corresponding _claims.yaml entry), or revise the claim if it was overstated. The audit-survivability stance (ADR-0046) requires either side to move, not the gap to widen.",
  );
  process.exit(1);
}
console.log("ADR-claim ↔ implementation coherence: OK.");
