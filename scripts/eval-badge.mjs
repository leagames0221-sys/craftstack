// Reads the most recent docs/eval/reports/YYYY-MM-DD.json and writes
// docs/eval/badge.json in the shields.io custom-endpoint shape so the
// README measured-eval badge always reflects the latest green run.
//
// Output schema is the shields.io endpoint contract:
//   https://shields.io/badges/endpoint-badge
//
// Failure mode: missing reports/ directory or empty reports/ folder
// is fatal — the workflow's `if: success()` guard means we only run
// after a green eval, which guarantees a fresh report just landed.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reportsDir = resolve(root, "docs/eval/reports");
const badgePath = resolve(root, "docs/eval/badge.json");

const files = readdirSync(reportsDir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();

if (files.length === 0) {
  console.error("[eval-badge] no report files in docs/eval/reports/");
  process.exit(1);
}

const latest = files.at(-1);
const report = JSON.parse(readFileSync(resolve(reportsDir, latest), "utf8"));

const passed = report.aggregate?.passed ?? 0;
const total = report.aggregate?.total ?? 0;
const passRatePct = report.aggregate?.passRatePct ?? 0;
const p95 = report.aggregate?.latencyP95Ms ?? 0;
const overallPass = report.aggregate?.overallPass ?? false;

const message = `${passed}/${total} · p95 ${(p95 / 1000).toFixed(1)}s`;
const color = overallPass
  ? passRatePct >= 80
    ? "brightgreen"
    : passRatePct >= 60
      ? "green"
      : "yellowgreen"
  : "orange";

const badge = {
  schemaVersion: 1,
  label: "Knowlex eval",
  message,
  color,
};

writeFileSync(badgePath, JSON.stringify(badge, null, 2) + "\n");
console.log(
  `[eval-badge] wrote docs/eval/badge.json from ${latest}: ${message} (${color})`,
);
