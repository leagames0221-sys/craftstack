// scripts/generate-attestation-data.mjs — runs at build time (vercel-build)
//
// Generates `apps/knowledge/src/lib/attestation-data.json` from the
// repo state at build time. The /api/attestation route imports this
// file + augments with runtime db state to produce the full audit
// payload. Pattern C (live derivation) for invariants that don't
// change between builds; runtime augmentation for db state that does.
//
// Companion to scripts/check-doc-drift.mjs (Pattern A — assert
// claims at PR time): this script bakes the same truth resolvers
// into a single endpoint reviewers can curl.
//
// Recorded in ADR-0056. Run as part of `apps/knowledge` vercel-build:
//   prisma generate && prisma migrate deploy
//     && node ../../scripts/generate-attestation-data.mjs
//     && next build

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// `git describe --tags --abbrev=0` does not work in Vercel's build
// environment (shallow clone with no tag refs fetched), and the
// scripts/check-doc-drift.mjs banner check already established
// CHANGELOG topmost release as the in-PR-synchronous truth source.
// Use the same source here so the build emits the version the PR is
// shipping rather than `untagged`.
const tag = safe(() => {
  const changelog = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf8");
  const m = changelog.match(/^##\s+\[(\d+\.\d+\.\d+)\]/m);
  if (!m) throw new Error("CHANGELOG topmost release not found");
  return `v${m[1]}`;
}, "untagged");

const commit = safe(
  () =>
    execSync("git rev-parse HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .trim()
      .slice(0, 8),
  "unknown",
);

const buildAt = new Date().toISOString();

// --- ADR count -----------------------------------------------------
const adrFiles = readdirSync(resolve(ROOT, "docs/adr")).filter((f) =>
  /^\d{4}-.*\.md$/.test(f),
);
const adrCount = adrFiles.length;

// --- Boardly route count -------------------------------------------
function walkCount(dir, predicate) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += walkCount(p, predicate);
    else if (predicate(e.name)) n++;
  }
  return n;
}
const boardlyRouteCount = walkCount(
  resolve(ROOT, "apps/collab/src/app"),
  (n) => n === "route.ts" || n === "page.tsx",
);

// --- Latest eval report --------------------------------------------
let lastEvalRun = null;
try {
  const reportsDir = resolve(ROOT, "docs/eval/reports");
  const reports = readdirSync(reportsDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (reports.length > 0) {
    const latestPath = resolve(reportsDir, reports.at(-1));
    const r = JSON.parse(readFileSync(latestPath, "utf8"));
    lastEvalRun = {
      ranAt: r.ranAt,
      goldenVersion: r.goldenVersion,
      passed: r.aggregate?.passed ?? null,
      total: r.aggregate?.total ?? null,
      passRatePct: r.aggregate?.passRatePct ?? null,
      latencyP50Ms: r.aggregate?.latencyP50Ms ?? null,
      latencyP95Ms: r.aggregate?.latencyP95Ms ?? null,
      overallPass: r.aggregate?.overallPass ?? null,
    };
  }
} catch {
  // No reports/ directory yet (fresh repo before first cron) — ok.
}

// --- Deferred features (hardcoded, audit-survivable) ---------------
const deferred = [
  {
    feature: "Hybrid search (BM25 + vector via RRF)",
    adr: "ADR-0011",
    reason: "ADR-0039 MVP scope",
  },
  {
    feature: "Cohere Rerank",
    adr: "ADR-0011",
    reason: "ADR-0039 MVP scope",
  },
  {
    feature: "HyDE (hypothetical document embeddings)",
    adr: "ADR-0014",
    reason: "ADR-0039 MVP scope",
  },
  {
    feature: "NLI Faithfulness check",
    adr: "ADR-0013",
    reason:
      "ADR-0039 MVP scope; LLM-as-judge --judge flag is the practical fix (ADR-0049 § 7th/8th arc)",
  },
  {
    feature: "PostgreSQL RLS",
    adr: "ADR-0010",
    reason: "Knowlex is single-tenant per ADR-0039",
  },
  {
    feature: "Auth-gated Knowlex (WorkspaceMember route guards)",
    adr: "ADR-0047",
    reason: "deferred until Auth.js lands on Knowlex",
  },
  {
    feature: "Pusher private/presence channels",
    adr: "T-01",
    reason: "v0.6.0 roadmap; current public channels are honest scope note",
  },
];

// --- Honest scope notes (snapshot of threat-model self-disclosure) -
const honestScopeNotes = [
  "T-01: Boardly Pusher channels are public; defence is access-control-by-id-secrecy until v0.6.0 private auth lands",
  "I-01: Knowlex is single-tenant per ADR-0039; auth-gated access deferred",
  "T-06: README measured-eval badge stays at last-green-state, not last-cron-state (auto-commit fires only on success per ADR-0049 § 7th arc Tier C-#2). See `measurements.daysSinceLastGreenRun` + `measurements.cronHealthHint` in this same payload for cron-health dimension",
];

// --- Assemble payload ----------------------------------------------
const data = {
  tag,
  commit,
  buildAt,
  claims: {
    adrCount,
    boardlyRouteCount,
    cspGrade: "A",
    cspNote:
      "rolled back from A+ per ADR-0040 (Vercel platform-injected scripts could not carry per-request nonce; hydration broke under nonce + strict-dynamic CSP)",
  },
  measurements: {
    lastEvalRun,
    // `daysSinceLastGreenRun` and `cronHealthHint` are computed at
    // request time in the route handler, not baked here.
  },
  scope: {
    deferred,
    honestScopeNotes,
  },
};

// --- Write to apps/knowledge/src/lib/ ------------------------------
const outDir = resolve(ROOT, "apps/knowledge/src/lib");
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}
const outPath = resolve(outDir, "attestation-data.json");
writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");

console.log(
  `[attestation] wrote ${outPath} (tag=${tag} commit=${commit} adr=${adrCount} routes=${boardlyRouteCount} lastEval=${
    lastEvalRun
      ? `${lastEvalRun.passed}/${lastEvalRun.total}@${lastEvalRun.ranAt.slice(0, 10)}`
      : "none"
  })`,
);
