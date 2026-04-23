/**
 * Knowlex RAG regression eval.
 *
 * Loads `docs/eval/golden_qa.json`, seeds the named corpus via
 * /api/kb/ingest (idempotent — duplicates are tolerated because the
 * retriever ranks by distance, not recency), fires each question
 * through /api/kb/ask, and scores the answer against:
 *
 *   - `expectedSubstrings`  — answer-faithfulness proxy. Every listed
 *     substring must appear in the model's reply (case-insensitive).
 *     This is a deliberately shallow check; a proper faithfulness
 *     score would use an LLM-as-judge and is tracked as a follow-up.
 *   - `expectedDocumentTitle` — citation-coverage proxy. The document
 *     that contains the answer must be present in the response's
 *     `x-knowlex-docs` header (pipe-separated).
 *   - `expectedRefusal`      — for adversarial / out-of-corpus prompts,
 *     the answer must NOT contain any seeded-content marker and must
 *     signal it cannot answer from context.
 *
 * Also tracks latency per question and asserts `p95 ≤ maxP95LatencyMs`
 * from the threshold manifest.
 *
 * Usage:
 *
 *   E2E_BASE_URL=https://craftstack-knowledge.vercel.app \
 *     pnpm --filter knowledge eval
 *
 *   # or, against a local dev server:
 *   E2E_BASE_URL=http://localhost:3001 \
 *     pnpm --filter knowledge eval
 *
 * The script exits non-zero if the observed pass rate is below
 * `thresholds.minPassRate`, making it safe to wire into a nightly
 * workflow once the corpus grows past this self-contained seed.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

type CorpusEntry = { title: string; content: string };
type Question =
  | {
      id: string;
      category: string;
      question: string;
      expectedSubstrings: string[];
      expectedDocumentTitle: string;
      expectedRefusal?: false;
    }
  | {
      id: string;
      category: string;
      question: string;
      expectedRefusal: true;
      expectedSubstrings?: string[];
      expectedDocumentTitle?: string;
    };
type GoldenSet = {
  version: number;
  thresholds: { minPassRate: number; maxP95LatencyMs: number };
  corpus: CorpusEntry[];
  questions: Question[];
};

type Outcome = {
  id: string;
  category: string;
  passed: boolean;
  latencyMs: number;
  reasons: string[];
};

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

const REFUSAL_MARKERS = [
  "do not contain",
  "does not contain",
  "not available",
  "no information",
  "cannot",
  "unable",
  "not provided",
  "outside",
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

function loadGolden(): GoldenSet {
  // Resolve relative to this file, not to cwd, so the script works
  // regardless of where pnpm / tsx is invoked from (monorepo root,
  // apps/knowledge, or an absolute path).
  const hereDir = dirname(fileURLToPath(import.meta.url));
  const path = resolve(hereDir, "../../../docs/eval/golden_qa.json");
  const body = readFileSync(path, "utf8");
  return JSON.parse(body) as GoldenSet;
}

async function ingestCorpus(corpus: CorpusEntry[]) {
  for (const doc of corpus) {
    const res = await fetch(`${BASE_URL}/api/kb/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `ingest of "${doc.title}" failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }
  }
}

async function ask(
  question: string,
): Promise<{ answer: string; docs: string[]; latencyMs: number }> {
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/api/kb/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const latencyMs = performance.now() - t0;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ask failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const answer = await res.text();
  const docs = (res.headers.get("x-knowlex-docs") ?? "")
    .split("|")
    .filter(Boolean);
  return { answer, docs, latencyMs };
}

function scoreQuestion(q: Question, answer: string, docs: string[]): string[] {
  const reasons: string[] = [];
  const low = answer.toLowerCase();

  if (q.expectedRefusal === true) {
    const refused = REFUSAL_MARKERS.some((m) => low.includes(m));
    if (!refused) {
      reasons.push(
        "expected refusal (off-corpus or adversarial) but answer asserted content",
      );
    }
    return reasons;
  }

  const missing = (q.expectedSubstrings ?? []).filter(
    (s) => !low.includes(s.toLowerCase()),
  );
  if (missing.length > 0) {
    reasons.push(`missing expected substrings: ${missing.join(", ")}`);
  }

  if (q.expectedDocumentTitle && !docs.includes(q.expectedDocumentTitle)) {
    reasons.push(
      `expected citation to "${q.expectedDocumentTitle}"; got [${docs.join(", ")}]`,
    );
  }

  return reasons;
}

async function main() {
  const golden = loadGolden();
  console.log(
    `[eval] base=${BASE_URL} questions=${golden.questions.length} corpus=${golden.corpus.length}`,
  );

  console.log("[eval] seeding corpus...");
  await ingestCorpus(golden.corpus);

  const outcomes: Outcome[] = [];
  for (const q of golden.questions) {
    try {
      const { answer, docs, latencyMs } = await ask(q.question);
      const reasons = scoreQuestion(q, answer, docs);
      outcomes.push({
        id: q.id,
        category: q.category,
        passed: reasons.length === 0,
        latencyMs,
        reasons,
      });
    } catch (err) {
      outcomes.push({
        id: q.id,
        category: q.category,
        passed: false,
        latencyMs: NaN,
        reasons: [`request failed: ${(err as Error).message}`],
      });
    }
  }

  // Per-question table
  console.log("\n[eval] results:");
  console.log(
    [
      "id".padEnd(6),
      "category".padEnd(12),
      "pass".padEnd(6),
      "ms".padStart(6),
      "reasons",
    ].join(" "),
  );
  for (const o of outcomes) {
    const ms = Number.isFinite(o.latencyMs) ? o.latencyMs.toFixed(0) : "?";
    console.log(
      [
        o.id.padEnd(6),
        o.category.padEnd(12),
        (o.passed ? "✅" : "❌").padEnd(6),
        ms.padStart(6),
        o.reasons.join("; "),
      ].join(" "),
    );
  }

  // Aggregate
  const passed = outcomes.filter((o) => o.passed).length;
  const passRate = passed / outcomes.length;
  const latencies = outcomes
    .map((o) => o.latencyMs)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  console.log("\n[eval] summary");
  console.log(
    `  passRate = ${passed}/${outcomes.length} = ${(passRate * 100).toFixed(1)}% ` +
      `(threshold ${(golden.thresholds.minPassRate * 100).toFixed(0)}%)`,
  );
  console.log(`  latency p50 = ${p50.toFixed(0)} ms`);
  console.log(
    `  latency p95 = ${p95.toFixed(0)} ms (threshold ${golden.thresholds.maxP95LatencyMs} ms)`,
  );

  const passRateOk = passRate >= golden.thresholds.minPassRate;
  const latencyOk = p95 <= golden.thresholds.maxP95LatencyMs;
  if (!passRateOk || !latencyOk) {
    console.error(
      `\n[eval] FAIL — passRateOk=${passRateOk} latencyOk=${latencyOk}`,
    );
    process.exit(1);
  }
  console.log("\n[eval] PASS");
}

main().catch((err) => {
  console.error("[eval] crashed:", err);
  process.exit(1);
});
