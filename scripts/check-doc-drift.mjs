// scripts/check-doc-drift.mjs — PR-blocking guard against prose drift.
//
// Closes the prose-coherence gap surfaced by the v2-methodology hiring
// sim (Run #4, doc 52 Stage 3) and the manual drift audit ratchet
// (Session 262, drift fix in PR #42). The audit found 11 files where
// embedded numerics ("206 Vitest", "v0.5.2 banner", "52 ADRs") had
// fallen out of sync with reality after a ship cycle. Without a
// structural gate, the next ship reproduces the same drift class.
//
// This script runs in `ci.yml` as a PR-blocking job. It walks a list
// of `claim` regexes per file and asserts the captured number /
// version matches the ground truth resolved from the actual codebase
// (`ls`, `git describe`, `pnpm test` output).
//
// Recorded in ADR-0054. Companion to ADR-0053 (runtime schema canary)
// — same shape: structural assertion that doc-claim ↔ implementation
// stays coherent at PR time, not at hiring-sim time.
//
// Run locally: `node scripts/check-doc-drift.mjs`
//
// Exit code 0 = no drift. Exit code 1 = drift detected (CI fails).
// Soft warnings (claim regex didn't match anything) print to stderr
// but do not fail; that catches "the regex moved out of date" without
// blocking unrelated PRs.

import { execSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
let failures = 0;
let warnings = 0;

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function pass(name) {
  console.log(`  ✓ ${name}`);
}

function fail(name, msg) {
  console.error(`  ✗ ${name}: ${msg}`);
  failures++;
}

function warn(name, msg) {
  console.warn(`  ⚠ ${name}: ${msg}`);
  warnings++;
}

// ---------------------------------------------------------------------
// Truth resolvers — derive the actual value from the filesystem / git.
// ---------------------------------------------------------------------

function adrCount() {
  return readdirSync(resolve(ROOT, "docs/adr")).filter((f) =>
    /^\d{4}-.*\.md$/.test(f),
  ).length;
}

function vitestCount(app) {
  // Run vitest and parse `Tests  N passed (N)` from the summary line.
  // Naive `test(` / `it(` parsing miscounts `test.each([...])` and
  // `describe.each([...])` because each row of the matrix expands
  // into a separate case at runtime; vitest's own count is the only
  // reliable truth. CI duplicates the run in the
  // `lint / typecheck / test / build` job, but ~1.5s per app is
  // cheap and the only-source-of-truth property is worth more.
  //
  // NO_COLOR=1 + FORCE_COLOR=0: belt-and-suspenders to keep vitest's
  // output ANSI-clean. CI runners can leak color codes into the
  // captured stdout depending on whether the runner has a tty
  // attached; without this the regex below fails to match and the
  // gate false-fails.
  const out = execSync(`pnpm --filter ${app} test`, {
    encoding: "utf8",
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
  });
  // Strip ANSI escape sequences regardless — defense-in-depth in case
  // some upstream layer ignores NO_COLOR.
  // eslint-disable-next-line no-control-regex
  const cleaned = out.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
  const m = cleaned.match(/Tests\s+(\d+)\s+passed/);
  if (!m) {
    throw new Error(
      `could not parse vitest output for ${app}; full output:\n${cleaned}`,
    );
  }
  return parseInt(m[1], 10);
}

function boardlyRouteCount() {
  let count = 0;
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts" || e.name === "page.tsx") count++;
    }
  }
  walk(resolve(ROOT, "apps/collab/src/app"));
  return count;
}

function playwrightTestCount() {
  let count = 0;
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".spec.ts")) {
        const text = readFileSync(p, "utf8");
        const matches = text.match(/^\s*test\s*\(/gm);
        if (matches) count += matches.length;
      }
    }
  }
  walk(resolve(ROOT, "apps/collab/tests/e2e"));
  return count;
}

function latestTag() {
  return execSync("git describe --tags --abbrev=0", {
    encoding: "utf8",
    cwd: ROOT,
  }).trim();
}

function latestChangelogVersion() {
  // The status banners track the version *this PR ships*, not the
  // last-tagged version, because tags are pushed after merge. Source
  // the truth from CHANGELOG.md's topmost `## [X.Y.Z]` entry
  // (skipping `## [Unreleased]`) so banners stay in sync within a PR.
  const text = read("CHANGELOG.md");
  const m = text.match(/^##\s+\[(\d+\.\d+\.\d+)\]/m);
  if (!m) {
    throw new Error(
      "could not parse CHANGELOG.md topmost release version (## [X.Y.Z])",
    );
  }
  return `v${m[1]}`;
}

// ---------------------------------------------------------------------
// Numeric / version claim checks.
// ---------------------------------------------------------------------

const collabVitest = vitestCount("collab");
const knowledgeVitest = vitestCount("knowledge");
const totalVitest = collabVitest + knowledgeVitest;
const adr = adrCount();
const routes = boardlyRouteCount();
const playwright = playwrightTestCount();
const tag = latestTag();
const releaseVersion = latestChangelogVersion();
// Strip leading "v" so the regex captures "0.5.4" not "v0.5.4" — but
// most banner patterns embed "v" before the number. We assert against
// the literal `tag` string verbatim.

console.log("=== Truth resolved from filesystem ===");
console.log(`  ADR count:               ${adr}`);
console.log(`  Vitest collab:           ${collabVitest}`);
console.log(`  Vitest knowledge:        ${knowledgeVitest}`);
console.log(`  Vitest total:            ${totalVitest}`);
console.log(`  Boardly route+page:      ${routes}`);
console.log(`  Playwright test() calls: ${playwright}`);
console.log(`  Latest git tag:          ${tag}`);
console.log(`  CHANGELOG release ver:   ${releaseVersion}`);
console.log("");
console.log("=== Numeric / version claim checks ===");

const numericChecks = [
  {
    name: `ADR count (${adr})`,
    truth: adr,
    claims: [
      ["README.md", /\((\d+) entries\)/g],
      ["README.md", /Decision records \((\d+)\)/g],
      ["docs/hiring/portfolio-lp.md", /\*\*(\d+) ADRs\*\*/g],
      ["apps/collab/src/app/page.tsx", /label="ADRs" value="(\d+)"/g],
    ],
  },
  {
    name: `Vitest total (${totalVitest})`,
    truth: totalVitest,
    claims: [
      ["README.md", /Tests: (\d+) Vitest/g],
      ["README.md", /tests-(\d+)%20%2B%20\d+/g],
      ["README.md", /Vitest \(\*\*(\d+)\*\* unit cases/g],
      ["README.md", /now \*\*(\d+)\*\*/g],
      ["docs/hiring/portfolio-lp.md", /\*\*(\d+) Vitest \+ \d+ Playwright\*\*/g],
      ["docs/hiring/portfolio-lp.md", /=\s*\*\*(\d+) unit cases\*\*/g],
      ["docs/hiring/interview-qa.md", /\*\*(\d+) cases\*\*/g],
      ["apps/collab/src/app/page.tsx", /label="Vitest cases" value="(\d+)"/g],
      ["apps/collab/src/app/page.tsx", /(\d+) Vitest \+ \d+ Playwright/g],
      ["apps/collab/src/app/layout.tsx", /(\d+) Vitest \+ \d+ Playwright/g],
      ["apps/collab/src/app/layout.tsx", /(\d+) Vitest tests/g],
      ["apps/collab/src/app/opengraph-image.tsx", /"(\d+) tests"/g],
    ],
  },
  {
    name: `Vitest collab subtotal (${collabVitest})`,
    truth: collabVitest,
    claims: [
      ["README.md", /(\d+) collab \+ \d+ knowledge/g],
      ["docs/hiring/portfolio-lp.md", /(\d+) Vitest in collab/g],
      ["docs/hiring/interview-qa.md", /(\d+) collab \+ \d+ knowledge/g],
    ],
  },
  {
    name: `Vitest knowledge subtotal (${knowledgeVitest})`,
    truth: knowledgeVitest,
    claims: [
      ["README.md", /\d+ collab \+ (\d+) knowledge/g],
      ["docs/hiring/portfolio-lp.md", /\+ (\d+) in knowledge/g],
      ["docs/hiring/interview-qa.md", /\d+ collab \+ (\d+) knowledge/g],
    ],
  },
  {
    name: `Boardly route count (${routes})`,
    truth: routes,
    claims: [["apps/collab/src/app/page.tsx", /label="Next routes" value="(\d+)"/g]],
  },
  {
    name: `Playwright test() count (${playwright})`,
    truth: playwright,
    claims: [
      ["README.md", /Tests: \d+ Vitest \+ (\d+) Playwright/g],
      ["README.md", /tests-\d+%20%2B%20(\d+)/g],
      ["README.md", /Playwright \(\*\*(\d+)\*\* scenarios/g],
      ["docs/hiring/portfolio-lp.md", /\*\*\d+ Vitest \+ (\d+) Playwright\*\*/g],
      ["docs/hiring/interview-qa.md", /\*\*(\d+) scenarios\*\*/g],
      ["apps/collab/src/app/page.tsx", /label="Playwright" value="(\d+)"/g],
      ["apps/collab/src/app/page.tsx", /\d+ Vitest \+ (\d+) Playwright/g],
      ["apps/collab/src/app/layout.tsx", /\d+ Vitest \+ (\d+) Playwright/g],
    ],
  },
];

for (const check of numericChecks) {
  let foundAny = false;
  for (const [file, regex] of check.claims) {
    let text;
    try {
      text = read(file);
    } catch {
      fail(check.name, `${file}: not found`);
      continue;
    }
    let match;
    let fileFoundAny = false;
    while ((match = regex.exec(text)) !== null) {
      foundAny = true;
      fileFoundAny = true;
      const got = parseInt(match[1], 10);
      if (got !== check.truth) {
        fail(
          check.name,
          `${file}: claims ${got}, truth is ${check.truth} (regex ${regex.source})`,
        );
      }
    }
    if (!fileFoundAny) {
      warn(
        check.name,
        `claim regex did not match any text in ${file} (regex ${regex.source}); the surrounding prose may have been rewritten`,
      );
    }
  }
  if (foundAny && failures === 0) {
    pass(check.name);
  } else if (!foundAny) {
    pass(`${check.name} (no claims found anywhere — soft warn list above)`);
  }
}

// ---------------------------------------------------------------------
// Latest-tag-in-status-banners check.
// ---------------------------------------------------------------------

console.log("");
console.log("=== Status banner version cross-check ===");

const statusBannerFiles = [
  "docs/hiring/portfolio-lp.md",
  "docs/hiring/interview-qa.md",
  "docs/architecture/system-overview.md",
  "docs/ops/runbook.md",
];

let bannerFailures = 0;
const bannerRegexes = [
  /\*\*Status \(as of (v\d+\.\d+\.\d+)/, // status banner used by 4 docs
  /Currently at \*\*(v\d+\.\d+\.\d+)/, // portfolio-lp lead paragraph
];

for (const file of statusBannerFiles) {
  const text = read(file);
  let fileFoundAny = false;
  for (const regex of bannerRegexes) {
    const m = text.match(regex);
    if (!m) continue;
    fileFoundAny = true;
    if (m[1] !== releaseVersion) {
      fail(
        "status banner",
        `${file}: claims ${m[1]} (${regex.source}), CHANGELOG topmost release is ${releaseVersion}`,
      );
      bannerFailures++;
    }
  }
  if (!fileFoundAny) {
    warn(
      "status banner",
      `${file}: no '**Status (as of vX.Y.Z' or 'Currently at **vX.Y.Z' banner found`,
    );
  }
}
if (bannerFailures === 0) {
  pass(
    `status banners all reference ${releaseVersion} (CHANGELOG topmost release; latest tag is ${tag})`,
  );
}

// ---------------------------------------------------------------------
// Vendor whitelist in code (no Fly.io / Socket.IO / BullMQ deps lurking
// in package.json). This is the v0.5.0 → v0.5.2 incident class
// reincarnated as a code-level guard: ADR-0052 superseded the original
// Fly.io plan; no live package.json should depend on the superseded
// vendors.
// ---------------------------------------------------------------------

console.log("");
console.log("=== Vendor whitelist in code ===");

const forbiddenDeps = ["socket.io", "socket.io-client", "@socket.io/", "bullmq"];
const codePackageJsons = [
  "package.json",
  "apps/collab/package.json",
  "apps/knowledge/package.json",
];

for (const file of codePackageJsons) {
  const text = read(file);
  const pkg = JSON.parse(text);
  const allDeps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  };
  for (const dep of Object.keys(allDeps)) {
    for (const forbidden of forbiddenDeps) {
      if (dep === forbidden || dep.startsWith(forbidden)) {
        fail(
          "vendor whitelist",
          `${file} depends on '${dep}' — superseded by ADR-0052 (Pusher Channels). Remove or amend ADR-0052.`,
        );
      }
    }
  }
}
if (failures === 0) {
  pass("no superseded vendor deps in package.json files");
}

// ---------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------

console.log("");
console.log(
  `=== Summary: ${failures} failure(s), ${warnings} warning(s) ===`,
);
if (failures > 0) {
  console.error(
    `\nDoc drift detected. Fix the claims above so they match the implementation, or update the implementation. Soft warnings are non-blocking but indicate a regex that may need maintenance (the surrounding prose has been rewritten).`,
  );
  process.exit(1);
}
console.log("Doc-vs-implementation coherence: OK.");
