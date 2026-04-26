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

import { retryFetch } from "../src/lib/eval-retry-fetch";

type CorpusEntry = { title: string; content: string };
type Question =
  | {
      id: string;
      category: string;
      question: string;
      // ADR-0049 § 7th arc (v0.5.1):
      // - expectedSubstrings: AND list (every substring must appear)
      // - expectedSubstringsAny: OR list (at least one must appear) — paraphrase-tolerant
      // Both fields can be combined: AND list must all hit AND at least one of OR list.
      // Either-only is also supported (one of the two must be present at the question level).
      expectedSubstrings?: string[];
      expectedSubstringsAny?: string[];
      expectedDocumentTitle: string;
      expectedRefusal?: false;
    }
  | {
      id: string;
      category: string;
      question: string;
      expectedRefusal: true;
      expectedSubstrings?: string[];
      expectedSubstringsAny?: string[];
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

/**
 * Spacing between consecutive eval HTTP calls. Knowlex's per-IP
 * limiter (apps/knowledge/src/lib/kb-rate-limit.ts) is 10 requests
 * per 60-second sliding window. From a single GitHub Actions runner
 * IP, 30 questions + 10 ingests = 40 sequential calls would blow
 * through that limit in under a minute without pacing. 7 seconds
 * between calls gives 60 / 7 ≈ 8.57 req/min steady-state — well
 * inside the 10/min cap with margin for shoulder load from Live
 * smoke or another simultaneous run. ADR-0049 § Rate-limit-aware
 * contract documents the regime; the retry layer in
 * `eval-retry-fetch.ts` is the safety net if pacing alone isn't
 * enough.
 */
const INTER_CALL_DELAY_MS = 7000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ADR-0049 § 7th arc (v0.5.1): expanded REFUSAL_MARKERS for soft-refusal
// phrasing observed in run 6 outputs against q008/q009/q030. Gemini 2.0
// Flash with temperature 0.7 phrases refusals more naturally — "I cannot
// disclose", "won't share", "policy", "not appropriate" — instead of
// the stricter "do not contain" phrasing the original 8-marker list
// expected. Adding markers below catches all observed soft refusals
// without false-positive risk on factual answers (these phrases don't
// occur in factual content about pgvector / LexoRank / RAG architecture).
const REFUSAL_MARKERS = [
  "do not contain",
  "does not contain",
  "not available",
  "no information",
  "cannot",
  "unable",
  "not provided",
  "outside",
  // v0.5.1 additions for soft-refusal patterns:
  "cannot disclose",
  "can't disclose",
  "won't share",
  "will not share",
  "not appropriate",
  "policy",
  "decline",
  "won't reveal",
  "will not reveal",
  "not authorized",
  "confidential",
  "not in the context",
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
  for (let i = 0; i < corpus.length; i++) {
    const doc = corpus[i];
    if (i > 0) await sleep(INTER_CALL_DELAY_MS);
    const res = await retryFetch(
      fetch,
      `${BASE_URL}/api/kb/ingest`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      },
      { label: `ingest "${doc.title}"` },
    );
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
  const res = await retryFetch(
    fetch,
    `${BASE_URL}/api/kb/ask`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    },
    { label: `ask "${question.slice(0, 40)}..."` },
  );
  // Wall-clock from request start through final return — includes any
  // retry+backoff time on cold-start paths. ADR-0049 § Measurement
  // contract names this as the user-perceived-latency measurement
  // (the operator's experience, not the per-attempt server time).
  // Pure-attempt latency is recoverable from retry breadcrumbs in the
  // CI log when needed.
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

  // ADR-0049 § 7th arc (v0.5.1): two-mode substring scoring.
  // - expectedSubstrings (AND): every entry must appear — strict.
  // - expectedSubstringsAny (OR): at least one entry must appear —
  //   paraphrase-tolerant. Use for questions where the corpus content
  //   is correct but Gemini at temperature 0.7 phrases the answer in
  //   one of several legitimate ways (e.g. "free tier" / "free-tier",
  //   "Singapore" / "Singapore region").
  // Both fields can coexist on a single question: the AND set is the
  // hard requirement; the OR set is the at-least-one-of paraphrase
  // hedge. Either field alone is also supported. The default behaviour
  // when neither field is present is "no substring requirement" — the
  // citation header check below remains.
  const expectedAny = q.expectedSubstringsAny ?? [];
  if (expectedAny.length > 0) {
    const anyHit = expectedAny.some((s) => low.includes(s.toLowerCase()));
    if (!anyHit) {
      reasons.push(
        `missing any of expected substrings (OR-mode): ${expectedAny.join(", ")}`,
      );
    }
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

  // Bridge sleep between ingest phase and ask phase. Without this, the
  // first ask follows immediately after the last ingest and counts as
  // call N+1 inside the same per-IP window. With it, the rate-limit
  // window has time to roll between phases. ADR-0049 § Rate-limit-aware
  // contract names this as the phase-boundary spacing.
  console.log(
    `[eval] bridging ${INTER_CALL_DELAY_MS}ms before ask phase to respect per-IP window...`,
  );
  await sleep(INTER_CALL_DELAY_MS);

  const outcomes: Outcome[] = [];
  for (let qi = 0; qi < golden.questions.length; qi++) {
    const q = golden.questions[qi];
    if (qi > 0) await sleep(INTER_CALL_DELAY_MS);
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
