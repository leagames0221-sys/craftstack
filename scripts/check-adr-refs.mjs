// scripts/check-adr-refs.mjs — closes axis 3 of the drift-audit
// framework (ADR-0057): asserts every `ADR-NNNN` reference in docs
// resolves to an existing ADR file. Cheap, no network, runs as part
// of doc-drift-detect.
//
// What this catches:
//   - "...per [ADR-NNNN](../adr/NNNN-something.md)..." in prose where
//     the ADR-NNNN file was never created (typo or aspirational ref)
//   - "[ADR-NNNN](../adr/NNNN-removed.md)" where the ADR was renamed
//     or removed but a doc still cites it
//
// What this does NOT catch (out of scope for v1):
//   - External link validity — that's `markdown-link-check`'s job;
//     wired in `.github/workflows/ci.yml` separately.
//   - Correctness of the cited ADR's content. An out-of-date
//     reference where the ADR exists but no longer makes the cited
//     claim is axis 7 (scripts/check-adr-claims.mjs).
//
// Run locally: node scripts/check-adr-refs.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
let failures = 0;

// 1. Build the set of valid ADR numbers.
const adrDir = resolve(ROOT, "docs/adr");
const adrFiles = readdirSync(adrDir).filter((f) => /^\d{4}-.*\.md$/.test(f));
const validIds = new Set(adrFiles.map((f) => f.slice(0, 4))); // "0001"

console.log(`=== ADR ID cross-reference check (${validIds.size} ADRs in docs/adr/) ===`);

// 2. Walk doc + relevant code dirs, extract ADR-NNNN references,
//    assert each resolves to a real ADR file.
const scanDirs = ["docs", "README.md", "CHANGELOG.md", "apps", "scripts"];
const refRegex = /\bADR-(\d{4})\b/g;
const refs = new Map(); // id → array of {file, lineNumber}

// Race-free walk: use `readdirSync(..., { withFileTypes: true })` which
// returns Dirent objects; no separate statSync call (avoids TOCTOU
// flagged by CodeQL js/file-system-race). Top-level `walk(path)` first
// classifies its target by trying readdir + falling back to file read.
const SCAN_EXTS = new Set([
  ".md",
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".json",
  ".yml",
  ".yaml",
]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", "dist", "build"]);

function processFile(p) {
  // Ignore the ADR files themselves — they reference themselves
  // legitimately and contain rendered MADR template text.
  if (p.includes("docs/adr/") || p.includes("docs\\adr\\")) return;
  const dotIdx = p.lastIndexOf(".");
  if (dotIdx < 0 || !SCAN_EXTS.has(p.slice(dotIdx))) return;
  let text;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    return;
  }
  let match;
  refRegex.lastIndex = 0;
  while ((match = refRegex.exec(text)) !== null) {
    const id = match[1];
    if (!refs.has(id)) refs.set(id, []);
    const lineNumber = text.slice(0, match.index).split("\n").length;
    const rel = p.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, "");
    refs.get(id).push({ file: rel.replaceAll("\\", "/"), lineNumber });
  }
}

function walk(p) {
  // Single readdir call returns Dirents that already carry the
  // file-vs-directory bit, so there's no separate statSync race
  // (CodeQL js/file-system-race). If `p` itself is a file (e.g.,
  // README.md / CHANGELOG.md passed at the top level), readdir throws
  // ENOTDIR and we fall through to processFile.
  let entries;
  try {
    entries = readdirSync(p, { withFileTypes: true });
  } catch {
    processFile(p);
    return;
  }
  for (const e of entries) {
    const child = join(p, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR_NAMES.has(e.name)) continue;
      walk(child);
    } else if (e.isFile()) {
      processFile(child);
    }
  }
}

for (const d of scanDirs) walk(resolve(ROOT, d));

let okCount = 0;
let dangling = 0;
for (const [id, sites] of [...refs.entries()].sort()) {
  if (validIds.has(id)) {
    okCount++;
    continue;
  }
  // Dangling — this ADR ID is referenced but the file does not
  // exist in docs/adr/.
  console.error(`  ✗ ADR-${id} referenced ${sites.length}× but not found in docs/adr/:`);
  for (const s of sites.slice(0, 10)) {
    console.error(`      ${s.file}:${s.lineNumber}`);
  }
  if (sites.length > 10) console.error(`      ... + ${sites.length - 10} more`);
  failures++;
  dangling++;
}

console.log(
  `=== ADR-ID summary: ${okCount} valid IDs referenced, ${dangling} dangling ===`,
);
if (failures > 0) {
  console.error(
    "\nDangling ADR references detected. Either create the ADR file, fix the reference (typo), or remove the reference if the decision was withdrawn.",
  );
  process.exit(1);
}
console.log("ADR-ID coherence: OK.");
