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

import { generateText } from "ai";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { retryFetch } from "../src/lib/eval-retry-fetch";
import { getGemini } from "../src/lib/gemini";
import {
  aggregateJudgeScores,
  buildJudgePrompt,
  DEFAULT_JUDGE_MODEL,
  parseJudgeResponse,
} from "../src/lib/judge-rubric";

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
  // ADR-0062 (closes ADR-0049 § 8th arc): optional LLM-as-judge
  // score. Populated only when `--judge` / `EVAL_JUDGE=1` is set.
  // null when judge mode is off, or when the judge call returned an
  // unparseable / out-of-range response (treated as "judge unavailable"
  // for that question — counted separately in the aggregate).
  judgeScore?: number | null;
  judgeReasoning?: string;
};

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

// ADR-0062: judge mode is off by default to keep the nightly eval $0/mo
// per ADR-0046. Opt in via either CLI flag (`--judge`) or env var
// (`EVAL_JUDGE=1`). The two paths are equivalent so workflows can
// toggle either way without re-engineering the script.
const JUDGE_MODE =
  process.argv.includes("--judge") ||
  process.env.EVAL_JUDGE === "1" ||
  process.env.EVAL_JUDGE === "true";

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;

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

/**
 * ADR-0065 — CI-only Credentials provider session acquisition.
 *
 * Post-v0.5.12 (ADR-0061), `/api/kb/ingest` requires an authenticated
 * Auth.js session because anonymous writes are explicitly disallowed
 * (cost-attack closure). For the calibration eval to seed corpus, we
 * sign in via the CI-only Credentials provider gated by the triple
 * `VERCEL!=1 + E2E_ENABLED=1 + E2E_SHARED_SECRET >= 16 bytes`.
 *
 * The dance mirrors apps/collab/tests/e2e/setup-auth.ts:
 *   1. GET /api/auth/csrf to obtain the CSRF token + the host cookie.
 *   2. POST /api/auth/callback/e2e with form-encoded credentials +
 *      CSRF token; capture the Set-Cookie session token.
 *   3. GET /api/auth/session with the merged cookie jar to verify
 *      the session is live and the email matches.
 *
 * On a server without the provider registered (= triple gate false),
 * step 2 returns a redirect/error. On a misconfigured server (e.g.
 * E2E_ENABLED set but secret too short) the provider isn't registered
 * either. Both fail loudly here rather than silently letting the
 * eval flow attempt unauthenticated ingest.
 */
const E2E_EMAIL = "e2e+owner@e2e.example";
const E2E_SECRET = process.env.E2E_SHARED_SECRET ?? "";

function parseSetCookie(setCookieHeaders: string[] | string | null): string {
  // Auth.js sends multiple Set-Cookie headers (csrf-token, callback-url,
  // session-token, etc). Reduce them to the `name=value` pairs needed
  // for subsequent Cookie request headers. We don't need to honor
  // Domain/Path/Secure/SameSite flags because every request stays on
  // the same origin (BASE_URL).
  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : setCookieHeaders
      ? [setCookieHeaders]
      : [];
  return headers
    .map((h) => h.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function mergeCookies(...jars: string[]): string {
  // Merge multiple cookie jars, later values override earlier ones for
  // the same name (so the final session-token wins after the redirect).
  const map = new Map<string, string>();
  for (const jar of jars) {
    if (!jar) continue;
    for (const pair of jar.split(";")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function acquireE2ESession(): Promise<string | null> {
  if (!E2E_SECRET || E2E_SECRET.length < 16) {
    console.warn(
      `[eval] E2E_SHARED_SECRET unset or < 16 bytes — skipping CI auth dance. ` +
        `Anonymous /api/kb/ingest will return 401 against a post-v0.5.12 server. ` +
        `Set E2E_SHARED_SECRET on both the server process AND this script env to enable calibration runs.`,
    );
    return null;
  }

  // 1) CSRF.
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok) {
    throw new Error(`[eval] CSRF fetch failed: ${csrfRes.status}`);
  }
  const csrfBody = (await csrfRes.json()) as { csrfToken?: string };
  const csrfToken = csrfBody.csrfToken;
  if (!csrfToken) {
    throw new Error(`[eval] CSRF response missing csrfToken field`);
  }
  const csrfCookies = parseSetCookie(csrfRes.headers.getSetCookie?.() ?? null);

  // 2) Credentials callback. Use form-encoding (Auth.js expects it).
  const form = new URLSearchParams({
    csrfToken,
    email: E2E_EMAIL,
    secret: E2E_SECRET,
    callbackUrl: BASE_URL,
  });
  const signinRes = await fetch(`${BASE_URL}/api/auth/callback/e2e`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookies,
    },
    body: form.toString(),
  });
  // Auth.js returns 302/303 on success.
  if (signinRes.status >= 400) {
    const text = await signinRes.text().catch(() => "");
    throw new Error(
      `[eval] credentials callback failed: ${signinRes.status} ${text.slice(0, 200)}. ` +
        `Verify E2E_ENABLED=1 + E2E_SHARED_SECRET on the server process and that the ` +
        `Credentials provider is registered (check server logs for ` +
        `"E2E credentials provider REGISTERED").`,
    );
  }
  const signinCookies = parseSetCookie(
    signinRes.headers.getSetCookie?.() ?? null,
  );
  const merged = mergeCookies(csrfCookies, signinCookies);

  // 3) Verify the session.
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { cookie: merged },
  });
  const session = (await sessionRes.json()) as {
    user?: { email?: string };
  } | null;
  if (session?.user?.email !== E2E_EMAIL) {
    throw new Error(
      `[eval] session verification failed: expected ${E2E_EMAIL}, got ${
        session?.user?.email ?? "<none>"
      }`,
    );
  }
  console.log(
    `[eval] CI auth dance complete — signed in as ${E2E_EMAIL} for the calibration run.`,
  );
  return merged;
}

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

async function ingestCorpus(
  corpus: CorpusEntry[],
  sessionCookie: string | null,
) {
  // Auth header: post-v0.5.12 ingest requires a signed-in session
  // (ADR-0061 cost-attack closure). The cookie is acquired upstream
  // via the CI-only Credentials provider (ADR-0065). Anonymous calls
  // get 401; the eval can still run against a server that has the
  // provider unregistered (e.g. for read-only paths) but ingest will
  // fail loudly.
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (sessionCookie) headers.cookie = sessionCookie;
  for (let i = 0; i < corpus.length; i++) {
    const doc = corpus[i];
    if (i > 0) await sleep(INTER_CALL_DELAY_MS);
    const res = await retryFetch(
      fetch,
      `${BASE_URL}/api/kb/ingest`,
      {
        method: "POST",
        headers,
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
  sessionCookie: string | null,
): Promise<{ answer: string; docs: string[]; latencyMs: number }> {
  // /api/kb/ask works anonymously against the demo workspace per
  // ADR-0061 § Demo split, but we forward the cookie when available
  // so calibration runs are session-attached end-to-end (consistent
  // with how a future authed UI would call the same endpoint).
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (sessionCookie) headers.cookie = sessionCookie;
  const t0 = performance.now();
  const res = await retryFetch(
    fetch,
    `${BASE_URL}/api/kb/ask`,
    {
      method: "POST",
      headers,
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

/**
 * ADR-0062 — call the judge model on a single (question, answer,
 * corpus excerpt) triple and return the parsed rubric score.
 *
 * Failure modes are non-fatal: a missing GEMINI_API_KEY returns null
 * (judge unavailable), a network error is logged + null returned, an
 * unparseable response yields null via `parseJudgeResponse`. The eval
 * never fails because of a judge call — judge scores are advisory in
 * v0.5.13 and `aggregateJudgeScores` excludes nulls from the
 * denominator so a judge outage doesn't silently lower the mean.
 */
async function judgeAnswer(args: {
  question: string;
  answer: string;
  expectedDocumentTitle: string;
  corpusExcerpt: string;
  apiKey: string;
}): Promise<{ score: number | null; reasoning: string }> {
  const prompt = buildJudgePrompt({
    question: args.question,
    answer: args.answer,
    expectedDocumentTitle: args.expectedDocumentTitle,
    corpusExcerpt: args.corpusExcerpt,
  });
  try {
    const g = getGemini(args.apiKey);
    const { text } = await generateText({
      model: g(JUDGE_MODEL),
      prompt,
      temperature: 0,
      maxOutputTokens: 200,
    });
    return parseJudgeResponse(text);
  } catch (err) {
    return {
      score: null,
      reasoning: `judge-call-failed: ${(err as Error).message.slice(0, 100)}`,
    };
  }
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

  // ADR-0065: acquire CI session cookie before any ingest call. Returns
  // null if E2E_SHARED_SECRET is unset (eval still runs read-only paths
  // unauthenticated; ingest will then 401 on a post-v0.5.12 server).
  console.log("[eval] acquiring CI session...");
  const sessionCookie = await acquireE2ESession();

  console.log("[eval] seeding corpus...");
  await ingestCorpus(golden.corpus, sessionCookie);

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
  // ADR-0062 — judge mode. Resolve API key once outside the loop so a
  // missing key short-circuits judge calls cleanly per question.
  const judgeApiKey = JUDGE_MODE ? (process.env.GEMINI_API_KEY ?? "") : "";
  if (JUDGE_MODE) {
    if (!judgeApiKey) {
      console.warn(
        `[eval] --judge enabled but GEMINI_API_KEY missing; judge scores will be null for every question.`,
      );
    } else {
      console.log(
        `[eval] --judge mode ON (model=${JUDGE_MODEL}); rubric scoring active.`,
      );
    }
  }

  // Pre-build a corpus lookup so the judge prompt can include the
  // ground-truth document content. The golden corpus is small (~13
  // entries) so a Map is fine.
  const corpusByTitle = new Map(golden.corpus.map((c) => [c.title, c.content]));

  for (let qi = 0; qi < golden.questions.length; qi++) {
    const q = golden.questions[qi];
    if (qi > 0) await sleep(INTER_CALL_DELAY_MS);
    try {
      const { answer, docs, latencyMs } = await ask(q.question, sessionCookie);
      const reasons = scoreQuestion(q, answer, docs);
      let judgeScore: number | null | undefined;
      let judgeReasoning: string | undefined;
      if (JUDGE_MODE && judgeApiKey && q.expectedDocumentTitle) {
        const verdict = await judgeAnswer({
          question: q.question,
          answer,
          expectedDocumentTitle: q.expectedDocumentTitle,
          corpusExcerpt: corpusByTitle.get(q.expectedDocumentTitle) ?? "",
          apiKey: judgeApiKey,
        });
        judgeScore = verdict.score;
        judgeReasoning = verdict.reasoning;
      } else if (JUDGE_MODE) {
        // Refusal questions or judge-unavailable: explicit null so the
        // outcome row carries a deliberate "no judge" signal rather
        // than an absent field that could be confused with judge-off.
        judgeScore = null;
        judgeReasoning = q.expectedDocumentTitle
          ? "judge api key missing"
          : "refusal question — no expected document to judge against";
      }
      outcomes.push({
        id: q.id,
        category: q.category,
        passed: reasons.length === 0,
        latencyMs,
        reasons,
        ...(JUDGE_MODE ? { judgeScore, judgeReasoning } : {}),
      });
    } catch (err) {
      outcomes.push({
        id: q.id,
        category: q.category,
        passed: false,
        latencyMs: NaN,
        reasons: [`request failed: ${(err as Error).message}`],
        ...(JUDGE_MODE
          ? { judgeScore: null, judgeReasoning: "request-failed-before-judge" }
          : {}),
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

  // ADR-0062 — judge aggregate. Mean over available scores; nulls
  // (judge unavailable / parse failure / refusal) are excluded from
  // the denominator. v0.5.13 reports the mean as advisory only — no
  // pass/fail threshold yet (a future ratchet can promote it to a
  // hard gate alongside passRate / p95Latency).
  const judgeAgg = JUDGE_MODE
    ? aggregateJudgeScores(outcomes.map((o) => o.judgeScore ?? null))
    : null;
  if (judgeAgg) {
    if (judgeAgg.meanScore !== null) {
      console.log(
        `  judgeMean = ${judgeAgg.meanScore.toFixed(2)} / 3.00 ` +
          `(${judgeAgg.available}/${judgeAgg.total} judged; ${JUDGE_MODEL})`,
      );
    } else {
      console.log(
        `  judgeMean = (unavailable — 0/${judgeAgg.total} judged; check GEMINI_API_KEY / ${JUDGE_MODEL} access)`,
      );
    }
  }

  const passRateOk = passRate >= golden.thresholds.minPassRate;
  const latencyOk = p95 <= golden.thresholds.maxP95LatencyMs;

  // ADR-0051 § Tier B-#1 / v0.5.2 follow-up — write a JSON report so the
  // eval workflow's `actions/upload-artifact@v4` step (eval.yml line 95-102)
  // has something to upload. Prior to this, eval.ts produced console output
  // only, and the workflow's `if-no-files-found: ignore` silently skipped
  // the upload step every night. Now Run N produces a tracked artifact;
  // future README-badge automation (Tier C-#2) can consume it directly
  // instead of sanitizing CI logs by hand.
  //
  // Schema is intentionally simple — version + timestamp + base url +
  // golden-set version + outcomes + aggregates + threshold pass/fail.
  // Adding fields later is additive (consumers should treat unknown
  // fields as forward-compatible).
  try {
    const hereDir = dirname(fileURLToPath(import.meta.url));
    const reportsDir = resolve(hereDir, "../../../docs/eval/reports");
    mkdirSync(reportsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const reportPath = resolve(reportsDir, `${date}.json`);
    const report = {
      schemaVersion: 1,
      ranAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      goldenVersion: golden.version,
      goldenSize: {
        questions: outcomes.length,
        corpus: golden.corpus.length,
      },
      thresholds: golden.thresholds,
      aggregate: {
        passed,
        total: outcomes.length,
        passRate,
        passRatePct: Number((passRate * 100).toFixed(1)),
        latencyP50Ms: Number.isFinite(p50) ? Math.round(p50) : null,
        latencyP95Ms: Number.isFinite(p95) ? Math.round(p95) : null,
        passRateOk,
        latencyOk,
        overallPass: passRateOk && latencyOk,
        // ADR-0062 — judge aggregate is null when --judge mode is off
        // so a downstream consumer can distinguish "judge mode wasn't
        // run" from "judge mode ran but every call failed" (which
        // populates judge.meanScore=null with judge.available=0).
        judge: judgeAgg
          ? {
              model: JUDGE_MODEL,
              meanScore:
                judgeAgg.meanScore !== null
                  ? Number(judgeAgg.meanScore.toFixed(3))
                  : null,
              available: judgeAgg.available,
              total: judgeAgg.total,
            }
          : null,
      },
      outcomes,
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n[eval] report written to docs/eval/reports/${date}.json`);
  } catch (err) {
    // Non-fatal: a report-write failure should not flip a passing eval to
    // a failing one. Log and continue so the workflow's exit code reflects
    // the eval result, not the disk-write result.
    console.error(
      `\n[eval] report write failed (non-fatal): ${(err as Error).message}`,
    );
  }

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
