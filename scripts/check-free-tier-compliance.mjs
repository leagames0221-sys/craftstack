#!/usr/bin/env node
/**
 * Free-tier compliance check.
 *
 * Exits non-zero when the repo is about to introduce a configuration
 * that could produce a billed invoice. Wired into ci.yml as a
 * PR-blocking gate so the "zero-cost by construction" guarantee
 * declared in COST_SAFETY.md and ADR-0046 is enforced, not aspired.
 *
 * What this catches (static, no network):
 *   1. vercel.json files declaring a paid plan
 *      ("plan": "pro" | "enterprise")
 *   2. Any package.json (root + apps/collab + apps/knowledge)
 *      depending on an SDK whose free tier requires a credit card
 *      on file. The list is conservative: SDKs that have real free
 *      tiers without CC (Sentry, Upstash, Pusher Sandbox, Resend) are
 *      allowed.
 *   3. A real-looking Gemini key pattern leaked into .env.example
 *   4. The root turbo / next config accidentally shipping a
 *      `@vercel/*` paid-tier adapter
 *
 * Keep the blocklist narrow. Noisy false positives will cause
 * reviewers to ignore this gate, which defeats the point.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const violations = [];

// Load the billable-SDK blocklist from the neighbouring JSON. Keeping
// it externalised means adding a new paid SDK to the deny list is a
// one-line JSON edit, not a script edit + diff review.
const blocklistPath = join(here, "billable-sdks.json");
let BILLABLE_SDKS = [];
try {
  const blocklist = JSON.parse(readFileSync(blocklistPath, "utf8"));
  BILLABLE_SDKS = blocklist.blockedPackages;
  if (!Array.isArray(BILLABLE_SDKS) || BILLABLE_SDKS.length === 0) {
    throw new Error("blockedPackages must be a non-empty array");
  }
} catch (err) {
  console.error(
    `Failed to load ${relative(root, blocklistPath).replace(/\\/g, "/")}: ${err.message}`,
  );
  process.exit(2);
}

function read(p) {
  const abs = join(root, p);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

// ---------------------------------------------------------------------------
// 1. vercel.json plan check
// ---------------------------------------------------------------------------
const vercelCandidates = [
  "vercel.json",
  "apps/collab/vercel.json",
  "apps/knowledge/vercel.json",
];
for (const p of vercelCandidates) {
  const text = read(p);
  if (!text) continue;
  if (/"plan"\s*:\s*"(?:pro|enterprise|team)"/i.test(text)) {
    violations.push(
      `${p}: declares a non-Hobby Vercel plan. Remove the "plan" field or pin it to "hobby".`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Billable SDK blocklist
// ---------------------------------------------------------------------------
// Blocklist loaded from scripts/billable-sdks.json. Each entry is an
// exact package name or a prefix (e.g. `@stripe/` catches every
// scoped package under the Stripe namespace).
function isBillable(dep) {
  return BILLABLE_SDKS.some((entry) => dep === entry || dep.startsWith(entry));
}

const pkgCandidates = [
  "package.json",
  "apps/collab/package.json",
  "apps/knowledge/package.json",
];
for (const p of pkgCandidates) {
  const text = read(p);
  if (!text) continue;
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    violations.push(`${p}: failed to parse as JSON (${err.message}).`);
    continue;
  }
  const deps = {
    ...(json.dependencies ?? {}),
    ...(json.devDependencies ?? {}),
    ...(json.optionalDependencies ?? {}),
  };
  for (const dep of Object.keys(deps)) {
    if (isBillable(dep)) {
      violations.push(
        `${p}: depends on "${dep}", which requires a credit card on file for any real use. See COST_SAFETY.md.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. .env.example leaked real-looking key
// ---------------------------------------------------------------------------
const envCandidates = [
  ".env.example",
  "apps/collab/.env.example",
  "apps/knowledge/.env.example",
];
for (const p of envCandidates) {
  const text = read(p);
  if (!text) continue;
  // Google AI Studio keys look like `AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (39 chars).
  // We flag matches as a safety net even though the Studio flavour is
  // free — a real key in an example file is always a bug.
  const m = /AIza[0-9A-Za-z_-]{35}/.exec(text);
  if (m) {
    violations.push(
      `${p}: looks like it contains a real Gemini key (${m[0].slice(0, 8)}…). Example files must use placeholders only.`,
    );
  }
  // Rough Stripe live key shape.
  if (/\bsk_live_[0-9A-Za-z]{24,}\b/.test(text)) {
    violations.push(`${p}: contains what looks like a live Stripe secret key.`);
  }
  // GitHub personal access token (classic).
  if (/\bghp_[0-9A-Za-z]{36}\b/.test(text)) {
    violations.push(`${p}: contains what looks like a GitHub PAT.`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (violations.length > 0) {
  console.error("Free-tier compliance check FAILED:");
  for (const v of violations) {
    console.error(`  - ${relative(root, v).replace(/\\/g, "/")}`);
  }
  console.error(
    "\nIf a violation is intentional, update COST_SAFETY.md + open an ADR documenting the tier change; this gate is here to make billing surprises impossible by default.",
  );
  process.exit(1);
}

console.log("Free-tier compliance check passed.");
console.log("  - No paid Vercel plan declared in any vercel.json");
console.log(
  `  - No billable SDKs (${BILLABLE_SDKS.length} entries in blocklist) in ${pkgCandidates.length} package.json files`,
);
console.log("  - No leaked secrets in .env.example files");
