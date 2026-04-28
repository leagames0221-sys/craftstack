# ADR-0062: LLM-as-judge `--judge` flag — closing ADR-0049 § 8th arc

- Status: Accepted
- Date: 2026-04-28
- Tags: eval, rag, knowlex, judge, faithfulness, opt-in
- Companions: [ADR-0049](0049-rag-eval-client-retry-contract.md) (the 8-arc eval-reliability incident log this ADR closes the deferred § 8th arc action item of), [ADR-0046](0046-zero-cost-by-construction.md) (free-tier compliance — the judge must not flip the default eval to a billable tier), [ADR-0061](0061-knowlex-auth-and-tenancy.md) (the prior in-session ratchet that established `vercel-build` migration regime; the judge runs from `apps/knowledge/scripts/eval.ts`, not at vercel-build, so no schema impact)

## Context

ADR-0049's 7th arc shipped substring-OR scoring for the Knowlex RAG eval (v0.5.1, golden_qa.json v4): every question carries an `expectedSubstrings` AND list and an `expectedSubstringsAny` OR list, so paraphrase-tolerant questions accept Gemini's natural-language variants. The 7th arc raised the typical eval pass-rate from ~13% (v3 substring-AND, run 6) to ~80% (v4 OR-mode, run 8).

The 8th arc (run 9, 2026-04-28) showed the OR-mode scoring is itself paraphrase-fragile against Gemini's output-distribution drift over time:

> **Paraphrase fragility recurrence**: Gemini's output distribution shifted over the day so the responses paraphrase the corpus content correctly but no longer trigger any of the OR-mode `expectedSubstringsAny` for the affected questions. The structural problem is the substring-OR scoring's coupling to lexical surface form; the structural fix is the LLM-as-judge `--judge` flag named in § 6th arc Trade-offs (deferred to v0.6.0+).

ADR-0049 § 8th arc § Action items named the path explicitly:

> 2. If Run 10/11 also red: ship the LLM-as-judge `--judge` flag (deferred from § 6th arc) as a separate post-processing pass. The default eval continues with substring-OR for cheapness; `--judge` becomes opt-in in CI on a periodic cadence.

ADR-0059 (framework v1.0 freeze) categorised this as a **product-feature deferred item, not an audit-framework axis** — the freeze rules don't gate it. ADR-0060 + ADR-0061 demonstrated the honest-disclose TTL pattern produces actual closures (T-01, I-01); ADR-0062 is the third graduation, this time closing a named-but-deferred eval ratchet rather than a threat-model row.

## Decision

Ship a `--judge` flag (and equivalent `EVAL_JUDGE=1` env var) on `apps/knowledge/scripts/eval.ts` that runs each (question, answer) pair through a stronger LLM judge using a 0-3 faithfulness rubric. Default off; opt-in only.

### Module split

- **`apps/knowledge/src/lib/judge-rubric.ts`** (new) — pure module with no Node-runtime entry. Exports `buildJudgePrompt`, `parseJudgeResponse`, `aggregateJudgeScores`, `RUBRIC_MIN`, `RUBRIC_MAX`, `DEFAULT_JUDGE_MODEL`. Lives under `src/lib/` so the `apps/knowledge/vitest.config.ts` `src/**/*.test.ts` glob discovers the test file (the same reason axis-7 helpers live under `src/lib/`).
- **`apps/knowledge/src/lib/judge-rubric.test.ts`** (new) — 17 Vitest cases pinning prompt construction, response parsing (clean JSON / quoted scores / code-fenced output / trailing prose / unparseable / out-of-range / missing reasoning / full RUBRIC_MIN..MAX range), aggregate calculation (mean over availables / null exclusion / empty input / all-null), and the `DEFAULT_JUDGE_MODEL = "gemini-2.5-pro"` invariant.
- **`apps/knowledge/scripts/eval.ts`** — wires the toggle + per-question `judgeAnswer` call + aggregate into the report JSON. The function `judgeAnswer` is intentionally local to `eval.ts` (it depends on `getGemini` + `generateText` from the AI SDK and runs in a Node script context; not a candidate for `src/lib/` until or unless the runtime app surface needs it).

### Toggles

Two equivalent toggles (the script accepts either):

```bash
node --import tsx scripts/eval.ts --judge       # CLI flag
EVAL_JUDGE=1 node --import tsx scripts/eval.ts  # env var
```

Why both: workflow_dispatch / GitHub Action runs configure env vars via `with:`; CLI flag is more ergonomic for a developer running locally. Same code path either way.

A third env (`EVAL_JUDGE_MODEL=gemini-2.5-flash`) lets an operator override the judge model without code change. Default = `gemini-2.5-pro` per `judge-rubric.ts DEFAULT_JUDGE_MODEL` (a stronger model than the generator's `gemini-2.5-flash`, which is the whole point of LLM-as-judge — the rubric judgement should not be from the same model that produced the answer).

### Rubric

```
3 = correct, fully grounded in the cited document. No hallucination.
2 = correct but partial — covers the main fact but misses a detail
    that the corpus supports.
1 = partially wrong — hedges or paraphrases in a way that loses
    a load-bearing fact, OR introduces a minor unsupported claim.
0 = wrong / hallucinated / refuses when the corpus has the answer.
```

The rubric is **integer 0..3, not Likert or prose**. Easier to aggregate (mean), easier to compare across runs, harder for the judge to weasel into a non-comparable verdict. Output format is `{"score": N, "reasoning": "<one sentence>"}`. The `parseJudgeResponse` parser is deliberately tolerant of code-fenced, prose-trailed, or quoted-integer responses because gemini-2.5-pro doesn't always honor "output ONLY JSON" instructions — non-fatal parse failures yield `score: null` (judge unavailable) so a flaky judge doesn't silently penalise the model.

### Aggregation

- **Per-question**: `outcomes[i].judgeScore` (number 0..3 | null) + `outcomes[i].judgeReasoning` (string).
- **Aggregate**: `report.aggregate.judge = { model, meanScore, available, total }`. Mean is computed over **available** scores only (nulls excluded from denominator) so a judge outage on N questions doesn't silently halve the mean. `available` + `total` make the data honest — a reviewer reading the report can see "judge ran on 28/30 questions, mean 2.4" vs "judge ran on 5/30 questions, mean 3.0" and weight accordingly.
- **Pass/fail threshold for judge mean**: **deferred** to v0.6.0+. v0.5.13 reports the mean as advisory only. Promoting the mean to a hard gate alongside `passRate` / `p95Latency` is a separate ratchet (it requires a few full eval runs to calibrate the threshold).

### Default-off discipline (ADR-0046 free-tier compliance)

The free-tier compliance check (`scripts/check-free-tier-compliance.mjs`) refuses billable SDK introductions. The judge call goes through the existing `@ai-sdk/google` path with a `gemini-2.5-pro` model id, which AI Studio Free tier permits at 5 RPM / 25 RPD. No new SDK; no Vertex AI billable surface. The ADR-0046 stance holds.

The **default-off** part is load-bearing: nightly cron continues to run substring-OR scoring at $0/mo. `--judge` becomes opt-in for periodic checks (e.g. workflow_dispatch on demand, or a separate weekly cron). The 25 RPD cap is sufficient for a single weekly run + ~20 occasional manual runs.

## Consequences

### Positive

- **ADR-0049 § 8th arc Action item (2) closed**. The named-but-deferred fix for paraphrase-fragility is shipped. Third graduation in three ships (T-01, I-01, ADR-0049 § 8th arc), consolidating the discipline pattern — disclosed deferrals graduate to closures on the timetable the prior ADR named.
- **Faithfulness signal decoupled from lexical surface form**. A reviewer running `--judge` mode sees a faithfulness rubric score that doesn't depend on Gemini's output-distribution-of-the-day. Run-to-run comparisons become meaningfully comparable on the rubric axis even when the substring-OR pass-rate fluctuates.
- **17 Vitest cases pin the parser invariants**. The `parseJudgeResponse` tolerance (code-fenced / quoted / trailing prose) is structurally tested — a future regression that breaks the parser fails CI, not the eval.
- **Aggregate honesty**: `judge.available / judge.total` exposes judge-call success rate. A future reviewer can distinguish "model is bad" from "judge call kept failing" without reading individual outcome rows.

### Negative

- **`gemini-2.5-pro` AI Studio Free tier is 25 RPD**. 30 questions × 1 judge call = 30 calls per eval. **One full `--judge` run per day** before the daily cap; subsequent runs in the same day will see judge calls 503 / be throttled. Documented in ADR § Default-off discipline; mitigation is "run weekly, not nightly".
- **The judge is itself a model and can be wrong**. A future ratchet might add a multi-judge ensemble or compare judge outputs across model versions for stability. v0.5.13 trusts a single judge call per question; null-score handling absorbs the worst case.
- **Judge prompt is hand-written, not optimised**. A more sophisticated rubric prompt (chain-of-thought, multiple criteria with sub-scores, self-consistency) would likely produce more reliable scores. v0.5.13 ships the simplest prompt that produces parseable output; iteration is a separate ratchet trigger.
- **Cost class shift if `EVAL_JUDGE_MODEL` is pointed at Vertex AI**. The free-tier compliance gate refuses billable SDKs, but **points at billable provider IDs are not gated** — a future operator who sets `EVAL_JUDGE_MODEL=gemini-1.5-pro-vertex-ai` (hypothetical) might bypass the cost regime. Mitigation: `judge-rubric.ts DEFAULT_JUDGE_MODEL` is hardcoded to AI Studio's free `gemini-2.5-pro`; the env-var override is documented as advanced operator only.

### Honest scope notes (advisory mean, not gate)

The judge mean is reported but does not yet gate pass/fail. A future ADR can promote the threshold once 3-5 weekly judge runs calibrate the steady-state mean. v0.5.13 ships the measurement surface; threshold promotion is a calibration exercise, not a v0.5.13 design choice.

## Alternatives

- **Replace substring-OR scoring entirely with judge mode**. Rejected — ADR-0046 free-tier compliance demands the default eval stay $0/mo and within rate limits. Substring-OR runs nightly at no cost; judge mode runs on a periodic cadence with the AI-Studio-Free RPD cap.
- **Use the same model for judge as generator (`gemini-2.5-flash`)**. Rejected — the whole point of LLM-as-judge is the judge is meaningfully stronger than the generator. The `DEFAULT_JUDGE_MODEL = "gemini-2.5-pro"` invariant is structurally tested in `judge-rubric.test.ts` — a future change that switches the default to a weaker model fails CI so the trade-off is explicit.
- **Use OpenAI / Anthropic as judge** (ensemble across providers). Rejected for v0.5.13 — would require an additional billable SDK install, breaking ADR-0046's free-tier compliance gate. v0.7.0+ candidate if a future review demonstrates single-provider judge bias.
- **JSON-mode forced output (Gemini's structured output API)**. Rejected for v0.5.13 — adds a per-call complexity (response-schema declaration, possible 400s on judge models that don't support JSON-mode strict) for marginal robustness gain over the tolerant `parseJudgeResponse` parser. Re-evaluate if parser failure rate exceeds 5% in production runs.
- **Promote judge mean to hard gate now**. Rejected — without 3-5 calibration runs the threshold would be arbitrary. Deferred to a separate ADR after weekly judge runs stabilise the steady-state mean.

## Implementation status

Shipped in v0.5.13:

- `apps/knowledge/src/lib/judge-rubric.ts` (new) — prompt builder, response parser, aggregate calculator, rubric constants.
- `apps/knowledge/src/lib/judge-rubric.test.ts` (new) — 17 Vitest cases.
- `apps/knowledge/scripts/eval.ts` — `judgeAnswer` function + per-question wiring + aggregate in report JSON. `--judge` CLI flag + `EVAL_JUDGE=1` env toggle. `EVAL_JUDGE_MODEL` env override.
- This ADR.
- `docs/adr/README.md` — index entry.
- `CHANGELOG.md` — v0.5.13 entry.
- `docs/adr/_claims.json` — ADR-0062 entries (judge-rubric module exists, eval.ts contains judge mode wiring, default judge model is gemini-2.5-pro).
- README + portfolio-lp + page.tsx Stat block — ADR count 60 → 61; Vitest 239 → 256 (174 collab + 82 knowledge).

### Verification

```bash
node scripts/check-doc-drift.mjs    # → 0 failures (ADR 61, Vitest 256)
node scripts/check-adr-claims.mjs   # → all pass; PR-time integrity asserts ADR-0062 has _claims.json entries
node scripts/check-adr-refs.mjs     # → 0 dangling
pnpm --filter knowledge test        # → 82 passed (was 65, +17 judge-rubric.test.ts)
```

Live exercise (post-merge, when an operator wants to run --judge mode):

```bash
EVAL_JUDGE=1 \
  GEMINI_API_KEY=<your AI Studio key> \
  E2E_BASE_URL=https://craftstack-knowledge.vercel.app \
  pnpm --filter knowledge eval

# Or via the existing eval.yml workflow with workflow_dispatch +
# the env var passed in:
gh workflow run eval.yml -f EVAL_JUDGE=1
```

The report JSON gains a `aggregate.judge = { model, meanScore, available, total }` field; per-outcome `judgeScore` + `judgeReasoning` are added.
