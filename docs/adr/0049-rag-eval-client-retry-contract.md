# ADR-0049: RAG eval client retry contract — defending nightly cron against Neon Free cold-start

- Status: Accepted
- Date: 2026-04-25
- Tags: knowlex, eval, ci, free-tier, observability

## Context

The RAG eval workflow (`.github/workflows/eval.yml`, shipped in v0.4.5)
fires nightly at 04:00 UTC against the live Knowlex deploy. The eval
script (`apps/knowledge/scripts/eval.ts`) seeds the v3 golden corpus
via `/api/kb/ingest`, fires the 30 questions through `/api/kb/ask`,
and scores against the substring + citation + p95 thresholds declared
in `docs/eval/golden_qa.json`.

The first scheduled run (2026-04-25 05:52 UTC) failed at the very
first ingest call:

```
[eval] crashed: Error: ingest of "Knowlex RAG architecture" failed: 500
   {"code":"Transaction API error: Unable to start a transaction in the given time.",
    "message":"Ingest failed: Transaction API error: Unable to start a transaction in the given time."}
```

Live smoke (a separate 6-hourly cron) was green continuously through
the same window — the live URLs themselves are healthy. The failure
shape is specific to the eval workflow's request timing.

The plain reading of the error: the Prisma client tried to open a
transaction inside the route handler and the underlying Postgres
connection was not ready in time. The most plausible cause given the
free-tier topology — Neon Free autosuspends compute after a quiet
window, and the eval cron is the first heavy traffic in 2.5 hours —
is a Neon cold-start latency that exceeds the route handler's
transaction-acquire timeout. This is consistent with the observation
that the same workflow run on warm-state retries succeeds.

This ADR doesn't claim certainty on root cause from a single failure.
It establishes the regime: **transient transaction errors on the first
nightly request are an expected free-tier reality, not a bug**, and
the eval client must defend against them so a single cold-start does
not drop a nightly report.

The Scenario C target (three consecutive nightly reports → measured
`contextPrecision / faithfulness / p95` README badge in v0.5.1)
depends on every individual nightly run completing. Without this
ADR's defence, the probability of three consecutive cold-warm rolls
is the bottleneck on the v0.5.1 ship date.

## Decision

A small `retryFetch` helper, kept as a pure module under
`apps/knowledge/src/lib/eval-retry-fetch.ts`, wraps every HTTP call
the eval script makes against the live deploy. The eval script's
`ingestCorpus` and `ask` functions both route through it.

### Retry contract

| Aspect                       | Value                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Default attempts             | 3 (first try + 2 retries)                                                                                                        |
| Default backoff              | `[2000, 4000]` ms — 2s before retry #1, 4s before retry #2                                                                       |
| Retry-eligible HTTP statuses | 500, 502, 503, 504                                                                                                               |
| Retry-eligible body markers  | `Unable to start a transaction` (Neon cold-start signature), `Connection terminated unexpectedly`, `FUNCTION_INVOCATION_TIMEOUT` |
| Network errors               | retried (fetch reject)                                                                                                           |
| 4xx statuses                 | NOT retried (request shape is wrong, not transient)                                                                              |
| Final attempt                | returned as-is so existing `if (!res.ok) throw …` guards still surface readable errors                                           |

### Body-marker detection

A 500 status alone is ambiguous — it could be a true server bug or a
cold-start. The body-marker check (`Unable to start a transaction`)
distinguishes the two: if the marker is present, retry; if not, the
status alone still triggers retry (conservative); if a 4xx with the
marker shows up, retry is suppressed (4xx never retried).

### Logging contract

Each retry emits a single-line breadcrumb to `console.warn` with the
attempt number, status, backoff wait, and the call's `label` field
(passed by the eval script — e.g. `"ingest \"Knowlex RAG
architecture\""`). The label flows through to the GitHub Actions log
so an operator scrolling the run sees, in order:

```
[retryFetch] [ingest "Knowlex RAG architecture"] attempt 1/3 got 500; retrying in 2000ms (Neon cold-start suspected)
[retryFetch] [ingest "Knowlex RAG architecture"] attempt 2/3 got 200
```

Three retries' worth of breadcrumbs across a 30-question run is the
expected steady-state ceiling — cold-start hits the first request
heavily and tapers off as Neon stays warm. If the breadcrumb count
ever exceeds ~5 per run, that's a regression worth investigating.

### Measurement contract

The eval's `latencyMs` for `/api/kb/ask` is wall-clock from request
start through final return — **including any retry+backoff time on
cold-start paths**. This is the operator's experience, not the
per-attempt server time, and matches the user-perceived-latency
contract a real Knowlex consumer would feel. Pure-attempt latency is
recoverable from the retry breadcrumbs in the CI log when needed for
deeper analysis.

p95 thresholds in `docs/eval/golden_qa.json` (`maxP95LatencyMs:
8000`) implicitly tolerate one retry path at the tail. If p95 ever
exceeds 8s, the retry breadcrumbs will show whether the cause is
slow Gemini generation or chronic cold-start re-fires; the
distinction lives in the log, not in the metric.

## Consequences

**What changes for nightly cron reliability**

- Single cold-start no longer drops a nightly report. Probability of
  three consecutive successful nights goes from "depends on Neon's
  autosuspend behaviour" to "≥ 0.9 for typical cold-start windows."
- The v0.5.1 measured-eval README badge ship date depends on retry
  reliability; this ADR is the prerequisite.
- Operators reading the nightly run log get explicit retry
  breadcrumbs instead of an opaque crash, so when cold-start
  frequency does shift (Neon plan change, traffic pattern change),
  the signal is in the log already.

**Trade-offs admitted**

- **Pure-attempt latency is hidden in the success metric.** A single
  cold-start retry inflates the measured `latencyMs` for that
  request by 2–4 s. The retry breadcrumb is the only place the
  per-attempt timing is recoverable; if a future analysis wants
  "Gemini-only latency" stripped of retry, retryFetch needs to grow
  per-attempt timing return values. Out of scope here.
- **Body-marker detection is heuristic.** A future Vercel/Neon error
  message change could leave a transient cold-start unmarked and a
  pure-status retry would still catch it (so the safety net holds),
  but the breadcrumb's "(Neon cold-start suspected)" annotation
  could become misleading. Acceptable — the retry still works, the
  log line is mildly stale.
- **Retry budget is fixed at 3 attempts × 2 calls × 30 questions.**
  Worst-case slowdown for an entire-corpus failure is `3 × 2s + 3 ×
4s = 18 s` per call × 60 calls = 18 min in the most pathological
  case. The workflow's `timeout-minutes: 15` is tight for this; if
  Neon ever has an extended outage (not a cold-start), the workflow
  times out cleanly rather than the script hanging. That's the
  right failure mode.
- **No retry-after header support yet.** Vercel surfaces
  `Retry-After: 3600` for `EMERGENCY_STOP=1` 503 responses
  (ADR-0046), and we currently ignore it — would retry every 2s and
  burn three attempts without a chance of success. Acceptable: an
  explicit `EMERGENCY_STOP` is by definition an operator-initiated
  pause; the eval failing fast is the correct signal that the kill
  switch is active.

**What this unblocks**

- v0.5.1: nightly cron can deliver three consecutive reports without
  hand-holding, so the README badge PR is mechanical commit-three-
  JSONs + add-shields.io-line.
- ADR-0049 documents the regime, so any future "should the eval
  retry?" question lands here rather than re-deriving the rationale
  from logs.
- Retry breadcrumb shape is now a load-bearing artefact for
  detecting cold-start frequency drift — a poor man's Neon
  observability.

## Related

- [ADR-0016](0016-free-tier-constraints.md) — free-tier-only stance, source of the Neon Free choice
- [ADR-0043](0043-knowlex-ops-cost-ci-eval.md) — original eval-in-CI integration story; this ADR closes the cold-start reliability gap
- [ADR-0046](0046-zero-cost-by-construction.md) — `$0/mo` regime; cold-start is the cost of that contract, retry is the defence
- `apps/knowledge/src/lib/eval-retry-fetch.ts` — pure-module retry helper
- `apps/knowledge/src/lib/eval-retry-fetch.test.ts` — 8 Vitest cases
- `apps/knowledge/scripts/eval.ts` — caller wired in
- `.github/workflows/eval.yml` — unchanged; retry lives entirely client-side

## Not in scope

- Auto-commit of passing reports back to `main` — Session 256-B follow-up.
- Auto-open issue on regression — Session 256-B follow-up.
- Per-attempt latency measurement returned from `retryFetch` — would
  require a richer return shape; tracked as a future-ADR if eval
  reporting ever needs it.
- Retry-after header handling — see Trade-offs.
