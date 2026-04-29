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
  // Hybrid search (BM25 + vector via RRF) was here through v0.5.13 and
  // was SHIPPED in v0.5.14 per ADR-0063 (closes ADR-0011 deferred —
  // tsvector + GIN index + Reciprocal Rank Fusion behind
  // HYBRID_RETRIEVAL_ENABLED env flag, default-off pending calibration
  // per ADR-0064). Removed here so the /api/attestation
  // `scope.deferred` array no longer self-contradicts ADR-0011 Status =
  // Fully Accepted. The flag-gated default-off detail is now surfaced
  // in `scope.shippedFlagGated[]` below for full audit visibility.
  // (Closure of Run #5 / ADR-0068 finding M1.)
  {
    feature: "Cohere Rerank",
    adr: "ADR-0011",
    reason:
      "Billable API key requirement conflicts with ADR-0046 zero-cost-by-construction; remains deferred independent of the v0.5.14 hybrid retrieval ship",
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
    reason:
      "v0.5.12 multi-tenant transition (ADR-0061) chose application-side enforcement via Auth.js + Membership table + demo allow-list pattern over RLS for simpler operator surface; RLS remains a viable future option. (Reason updated v0.5.18 / ADR-0068 — prior text 'Knowlex is single-tenant per ADR-0039' was stale post-v0.5.12.)",
  },
  // I-01 / Auth-gated Knowlex was on this list through v0.5.11 and was
  // resolved in v0.5.12 — see ADR-0061 (Auth.js + Membership shipped,
  // demo workspace allow-list preserves the live RAG demo). Kept
  // removed here so the /api/attestation `scope.deferred` array
  // reflects current reality.
  // T-01 (Pusher private/presence channels) was on this list through v0.5.10
  // and was resolved in v0.5.11 — see ADR-0060.
];

// --- Shipped flag-gated features (audit-survivable) -----------------
// Features that are fully shipped at the code + migration level but
// remain default-off (or partial-coverage) behind an env flag. Listed
// separately from `deferred` so a reviewer can see at a glance: this
// is in the build, but it is not exercised by default-config traffic.
const shippedFlagGated = [
  {
    feature: "Hybrid retrieval (Postgres FTS BM25 + pgvector cosine via RRF)",
    adr: "ADR-0011",
    closingAdr: "ADR-0063",
    shippedIn: "v0.5.14",
    flag: "HYBRID_RETRIEVAL_ENABLED",
    flagDefault: "off",
    note: "Default-off pending calibration lift figure per ADR-0064 / ADR-0065 architectural-gap closure path; Run #5 surfaced internal-attestation drift on this entry, closed by ADR-0068.",
  },
];

// --- Honest scope notes (snapshot of threat-model self-disclosure) -
const honestScopeNotes = [
  // T-01 was here from v0.5.4 through v0.5.10 ("Boardly Pusher channels are
  // public; defence is access-control-by-id-secrecy until v0.6.0 private
  // auth lands"). Resolved in v0.5.11 per ADR-0060 (private-board-<id>
  // channels with server-signed auth route).
  // I-01 was here from v0.5.4 through v0.5.11 ("Knowlex is single-tenant per
  // ADR-0039; auth-gated access deferred"). Resolved in v0.5.12 per ADR-0061
  // (Auth.js v5 shipped on Knowlex; requireDemoOrMember + requireMemberForWrite
  // gate /api/kb/ask and /api/kb/ingest; demo workspace stays anonymously
  // readable by allow-list).
  // Both removed here so the live /api/attestation honestScopeNotes
  // accurately reflects the currently-disclosed set.
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
      "rolled back from A+ per ADR-0040 (Vercel platform-injected scripts could not carry per-request nonce; hydration broke under nonce + strict-dynamic CSP). v0.5.18 / ADR-0068 § Finding C: live script-src directive includes 'unsafe-inline' AND 'unsafe-eval' (eval() / new Function() permitted); 'unsafe-eval' required by Vercel Live preview toolbar runtime + some bundler chunks under the static-CSP regime — a future ratchet may attempt nonce-based scoping that retains 'unsafe-eval' only for the Vercel Live origin if the trade-off becomes worth re-litigating.",
  },
  measurements: {
    lastEvalRun,
    // `daysSinceLastGreenRun` and `cronHealthHint` are computed at
    // request time in the route handler, not baked here.
  },
  scope: {
    deferred,
    shippedFlagGated,
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
