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

console.log(
  `\n=== ADR-claim summary: ${data.claims.length - failures}/${data.claims.length} pass, ${failures} failure(s) ===`,
);
if (failures > 0) {
  console.error(
    "\nADR claim drift detected. Either fix the implementation to match the ADR, update the ADR (and the corresponding _claims.yaml entry), or revise the claim if it was overstated. The audit-survivability stance (ADR-0046) requires either side to move, not the gap to widen.",
  );
  process.exit(1);
}
console.log("ADR-claim ↔ implementation coherence: OK.");
