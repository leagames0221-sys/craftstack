/**
 * LLM-as-judge rubric scoring for the Knowlex eval (ADR-0062 / closes
 * ADR-0049 § 8th arc deferred item).
 *
 * The substring-OR scoring (`expectedSubstrings` / `expectedSubstringsAny`)
 * in eval.ts measures lexical surface-form match. ADR-0049 § 6th and
 * § 8th arcs documented its structural failure mode: Gemini's output
 * distribution shifts over time and answers can be **factually correct
 * + cite the right document** but still fail the substring check
 * because the model paraphrased the corpus. The fix named in ADR-0049
 * § 6th arc Trade-offs and re-named in § 8th arc § Action items is a
 * **second pass that asks a stronger model (the "judge") to score the
 * answer for faithfulness**, decoupled from lexical surface form.
 *
 * Design choices:
 *
 * - **Opt-in, not default**. Substring-OR scoring stays the
 *   $0/mo-by-construction default per ADR-0046. The judge fires only
 *   when `--judge` CLI flag or `EVAL_JUDGE=1` env is set. Most CI runs
 *   skip it; periodic runs (workflow_dispatch / weekly cron) include it.
 *
 * - **Judge model defaults to `gemini-2.5-pro`** (opt-in to a stronger
 *   model than the generator's `gemini-2.5-flash`). Override via
 *   `EVAL_JUDGE_MODEL=<model-id>` env. AI Studio Free tier supports
 *   2.5-pro at lower RPM than 2.5-flash; the eval's existing 7-second
 *   inter-call spacing (apps/knowledge/scripts/eval.ts INTER_CALL_DELAY_MS)
 *   stays inside the 5 RPM judge cap with margin.
 *
 * - **Rubric is 0-3 integers, not free text**. Easier to aggregate and
 *   compare across runs than a Likert scale or prose verdict. The
 *   integer scale is parsed by regex from the JSON-style judge output
 *   (no JSON-mode forced — gemini-2.5-pro's prose-with-{score:N}
 *   responses parse cleanly enough for portfolio scale).
 *
 * - **Score thresholds for pass/fail are advisory in v0.5.13**. The
 *   judge produces per-question rubric scores aggregated as a mean;
 *   a future ratchet (v0.6.0 candidate, ADR-0049 § 9th arc when it
 *   lands) can promote the mean-score to a hard pass/fail threshold
 *   alongside the existing `minPassRate` / `maxP95LatencyMs`.
 *
 * - **Cost honest-disclose**: gemini-2.5-pro is a paid model on
 *   Vertex AI. AI Studio Free tier has it at 5 RPM / 25 RPD (sufficient
 *   for 30 questions × 1 judge call = 30 calls in ~6 minutes, but the
 *   25 RPD daily cap means ~one full eval per day on Free tier).
 *   ADR-0046 free-tier compliance gate refuses billable SDK usage; the
 *   judge call goes through the existing Free-tier-only `@ai-sdk/google`
 *   path with a `gemini-2.5-pro` model id, which AI Studio Free tier
 *   permits. If a future operator points the judge at Vertex AI (paid),
 *   the free-tier gate would reject the billable provider.
 */

/**
 * Rubric score range (integer). 0 = wrong / hallucinated, 3 = correct
 * + grounded in the cited document.
 */
export const RUBRIC_MIN = 0;
export const RUBRIC_MAX = 3;

/**
 * Default judge model. Override with `EVAL_JUDGE_MODEL` env.
 */
export const DEFAULT_JUDGE_MODEL = "gemini-2.5-pro";

/**
 * Render the judge prompt for a single question/answer/corpus triple.
 *
 * The corpus excerpt is intentionally truncated to ~1500 chars: the
 * golden_qa.json corpus entries are short (mean ~600 chars) so the
 * full content fits, but the truncation cap defends against a future
 * golden expansion where a single corpus entry might be larger than
 * judge context budget. The cited document title is included so the
 * judge can verify the answer is grounded in the right document.
 */
export function buildJudgePrompt(args: {
  question: string;
  answer: string;
  expectedDocumentTitle: string;
  corpusExcerpt: string;
}): string {
  const excerpt =
    args.corpusExcerpt.length > 1500
      ? args.corpusExcerpt.slice(0, 1500) + "...[truncated]"
      : args.corpusExcerpt;
  return [
    "You are a faithfulness rubric judge for a RAG (retrieval-augmented",
    "generation) system. Score the answer below on a 0-3 integer scale:",
    "",
    "- 3 = correct, fully grounded in the cited document. No hallucination.",
    "- 2 = correct but partial — covers the main fact but misses a detail",
    "      that the corpus supports.",
    "- 1 = partially wrong — hedges or paraphrases in a way that loses",
    "      a load-bearing fact, OR introduces a minor unsupported claim.",
    "- 0 = wrong / hallucinated / refuses when the corpus has the answer.",
    "",
    'Output ONLY the JSON object: { "score": N, "reasoning": "<one sentence>" }',
    "where N is an integer 0..3. Do not output any other text.",
    "",
    "---",
    `QUESTION: ${args.question}`,
    "",
    `EXPECTED DOCUMENT TITLE: ${args.expectedDocumentTitle}`,
    "",
    "CORPUS EXCERPT (the document the answer should be grounded in):",
    `"""${excerpt}"""`,
    "",
    "MODEL ANSWER:",
    `"""${args.answer}"""`,
    "",
    "Now output the rubric JSON.",
  ].join("\n");
}

/**
 * Parse the judge's response text into a rubric verdict. Tolerant of:
 *
 * - JSON wrapped in code fences (```json {...} ```) — Gemini sometimes
 *   adds them despite the explicit "do not output any other text".
 * - Trailing prose after the JSON object — extracted by greedy regex.
 * - The `score` field as a string ("3") instead of a number.
 *
 * Returns `{ score: null, reasoning: "<failure mode>" }` if no
 * extractable JSON object is present. Callers treat null score as
 * "judge unavailable" (separate aggregate bucket from 0-3 scores) so
 * a parsing failure doesn't silently penalise the model.
 */
export function parseJudgeResponse(raw: string): {
  score: number | null;
  reasoning: string;
} {
  // Strip code fences first so the JSON-extraction regex doesn't trip
  // on the ```json prefix.
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

  // Greedy match the first {...} block. The reasoning field is allowed
  // to contain quotes if the judge double-escaped, but the simple
  // pattern catches the common case; when the regex fails we return
  // null and the caller treats it as judge-unavailable.
  const m = cleaned.match(/\{[\s\S]*?"score"\s*:\s*"?(\d+)"?[\s\S]*?\}/);
  if (!m) {
    return { score: null, reasoning: `unparseable: ${cleaned.slice(0, 100)}` };
  }

  const score = parseInt(m[1], 10);
  if (!Number.isFinite(score) || score < RUBRIC_MIN || score > RUBRIC_MAX) {
    return {
      score: null,
      reasoning: `out-of-range: ${m[1]} (expected ${RUBRIC_MIN}-${RUBRIC_MAX})`,
    };
  }

  // Reasoning is best-effort. Look for "reasoning":"..." but tolerate
  // its absence (judge sometimes omits when score is 3).
  const rm = cleaned.match(/"reasoning"\s*:\s*"([^"]*)"/);
  const reasoning = rm ? rm[1] : "(no reasoning provided)";

  return { score, reasoning };
}

/**
 * Aggregate per-question judge scores into a mean. Null scores
 * (unavailable / parse failure) are excluded from the denominator
 * — they're tracked separately as `judgeUnavailable` count so a
 * judge outage doesn't silently move the mean.
 */
export function aggregateJudgeScores(scores: (number | null)[]): {
  meanScore: number | null;
  total: number;
  available: number;
} {
  const available = scores.filter((s): s is number => s !== null);
  if (available.length === 0) {
    return { meanScore: null, total: scores.length, available: 0 };
  }
  const sum = available.reduce((a, b) => a + b, 0);
  return {
    meanScore: sum / available.length,
    total: scores.length,
    available: available.length,
  };
}
