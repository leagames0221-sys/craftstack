// scripts/check-csp-coherence.mjs — PR-time gate for CSP description
//
// Asserts that the README's CSP description (line 175 region) mentions
// every load-bearing directive present in `apps/collab/next.config.ts`'s
// `CSP` constant. Closes ADR-0068 § Finding C — the case where
// `'unsafe-eval'` was added to the live CSP but the README description
// only mentioned `'unsafe-inline'`, surfacing as a Run #5 hiring-sim
// drift finding.
//
// "Load-bearing directive" = any of:
//   'unsafe-inline'    — allows in-page <script> + inline handlers
//   'unsafe-eval'      — allows eval() / new Function()
//   'strict-dynamic'   — disables host-based allowlists
//   'nonce-...'        — implies per-request nonce regime
//   'wasm-unsafe-eval' — allows WebAssembly.compile() / instantiate
//
// These are the directives a senior security reviewer materially cares
// about when judging the CSP posture. Allowlisted vendor origins
// (https://vercel.live, etc.) are NOT load-bearing in this sense — the
// README mentions "Vercel-platform allowlists" generically, which is
// sufficient.
//
// Pattern A (assert claims at PR time), companion to:
//   - scripts/check-doc-drift.mjs        — generic prose claim cross-check
//   - scripts/check-adr-claims.mjs       — ADR claims ↔ implementation
//   - scripts/check-adr-refs.mjs         — ADR cross-reference integrity
//   - scripts/check-free-tier-compliance.mjs — billable-SDK guard
//   - this script                        — CSP description coherence
//
// Run as `node scripts/check-csp-coherence.mjs` from repo root. Exits 0
// on coherence, 1 on drift. Wired into `drift-detect-v2` step in
// `.github/workflows/ci.yml`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const LOAD_BEARING_DIRECTIVES = [
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'strict-dynamic'",
  "'wasm-unsafe-eval'",
];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log("=== CSP coherence gate (ADR-0068 § Finding C) ===");

// --- 1. Load the live CSP source from next.config.ts ---------------
const nextConfigPath = resolve(ROOT, "apps/collab/next.config.ts");
const nextConfigSrc = readFileSync(nextConfigPath, "utf8");

// Extract the `script-src` directive line from the CSP array literal.
// Tolerant of whitespace + line continuation; not a full TS parser.
const scriptSrcMatch = nextConfigSrc.match(
  /"script-src([^"]*)"/,
);
if (!scriptSrcMatch) {
  fail(
    `could not extract \`script-src\` from ${nextConfigPath} — pattern changed?`,
  );
  process.exit(1);
}
const scriptSrc = scriptSrcMatch[1];
console.log(`  next.config.ts script-src: '${scriptSrc.trim()}'`);

const presentDirectives = LOAD_BEARING_DIRECTIVES.filter((d) =>
  scriptSrc.includes(d),
);
console.log(
  `  load-bearing directives present: ${
    presentDirectives.length > 0 ? presentDirectives.join(", ") : "(none)"
  }`,
);

// --- 2. Load the README CSP description -----------------------------
const readmePath = resolve(ROOT, "README.md");
const readmeSrc = readFileSync(readmePath, "utf8");

// The README "Security headers" bullet starts with `- **Security headers**`
// and runs until the next bullet. We extract that span and search
// case-insensitively for each directive.
const securityHeadersMatch = readmeSrc.match(
  /- \*\*Security headers\*\*[\s\S]*?(?=\n- \*\*)/,
);
if (!securityHeadersMatch) {
  fail(
    `could not locate the "Security headers" bullet in README.md — bullet structure changed?`,
  );
  process.exit(1);
}
const cspSection = securityHeadersMatch[0];

// --- 3. Assert every present directive is mentioned in the README ---
let drift = 0;
for (const directive of presentDirectives) {
  if (cspSection.includes(directive)) {
    ok(`README mentions ${directive}`);
  } else {
    fail(
      `README "Security headers" bullet does NOT mention ${directive}, but it IS present in apps/collab/next.config.ts script-src. ` +
        `Either remove it from the live CSP or add it to the README description per ADR-0068 § Finding C.`,
    );
    drift++;
  }
}

// (Note: a reverse check — "directives mentioned in README but not
// present in the live CSP" — was attempted and removed because legitimate
// historical context is hard to distinguish from a stale claim. E.g.,
// the README's "rolled back from the earlier A+ nonce + 'strict-dynamic'
// stance" mentions 'strict-dynamic' purely to explain WHY it was removed,
// not to claim it's active. The forward check above is the load-bearing
// gate; reverse coherence relies on review.)

// --- 4. Live response coherence (optional, skipped in CI by default) ---
// In CI we cannot reliably curl the live deploy from a fresh build,
// and the static next.config.ts source is the canonical truth at PR
// time. The /status page or smoke.yml is where live-vs-config drift
// gets caught. Documented here so the reader knows this gate
// deliberately stops at config-vs-readme coherence.

console.log(
  `\n=== Summary: ${drift} failure(s), checked ${presentDirectives.length} load-bearing directive(s) ===`,
);
if (drift === 0) {
  console.log("CSP description coherence: OK.");
}
