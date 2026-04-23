# ADR-0046: Zero-cost by construction — CI-enforced free-tier + kill switch

- Status: Accepted
- Date: 2026-04-24
- Tags: cost-safety, ci, threat-model, operations, portfolio

## Context

COST_SAFETY.md (from Session 251) and ADR-0037 described a layered-budget
stance: per-IP sliding window + per-container day/month budget + free-tier-only
services. ADR-0043 added cost-guard parity across both apps and a scheduled
smoke workflow. The STRIDE model in `docs/security/threat-model.md` covered the
usual six categories.

What was still missing was **the enforcement loop**. Three gaps:

1. **Claim-vs-reality drift risk.** Nothing in CI prevented a future commit
   from introducing `stripe`, `@vercel/kv`, or a `"plan": "pro"` line into a
   `vercel.json`. The guarantee "this deployment cannot be billed" depended on
   reviewers remembering COST_SAFETY.md during every review.
2. **No human-driven kill switch.** If the Gemini key ever leaks, the per-IP
   limiter and container budget will contain the bleed but won't _stop_ it
   until the key is rotated — a process that takes minutes at best. There was
   no env flag to shut traffic off at the request boundary.
3. **No cost-shape STRIDE row.** The threat model treated DoS as generic
   request flooding (D-01..D-04); the _actual_ attack shape this portfolio is
   most exposed to is someone deliberately burning the operator's inference
   budget. That deserves a first-class category.

ADR-0043's trade-off column already admitted that the eval suite "requires
manual invocation until secrets gating is configured." That caveat is fine for
`eval` (needs a real Gemini key in CI). It is _not_ fine for the cost-safety
guarantee, which can be enforced with a static check that needs no secrets.

## Decision

Close the loop with three complementary pieces. All three are in scope of this
ADR; none is aspirational.

### 1. PR-blocking free-tier compliance gate

New script `scripts/check-free-tier-compliance.mjs` runs as a dedicated
`free-tier-compliance` job in `ci.yml`. It is Node-only (no deps, no network)
and blocks merges when it detects:

- A `vercel.json` declaring `"plan": "pro" | "enterprise" | "team"`.
- Any `package.json` (root + both apps) depending on an SDK from a conservative
  billable-only blocklist: `stripe`, `@stripe/*`, `twilio`, `@twilio/*`,
  `@sendgrid/mail`, `@vercel/kv`, `@vercel/postgres`, `@vercel/blob`,
  `mongodb-atlas`.
- A real-looking secret pattern in any `.env.example`
  (Gemini `AIza…{35}`, Stripe `sk_live_…`, GitHub `ghp_…`).

The blocklist is intentionally narrow: SDKs with credible CC-free tiers
(Sentry, Upstash, Pusher Sandbox, Resend, AI Studio Gemini) are allowed. False
positives here would erode the gate's signal.

`package.json` gets `"check:free-tier": "node scripts/check-free-tier-compliance.mjs"`
so the same gate runs locally in one command.

### 2. `EMERGENCY_STOP=1` kill switch

New `src/lib/emergency-stop.ts` in both apps, wired into three routes:
`apps/knowledge/src/app/api/kb/{ask,ingest}/route.ts` and
`apps/collab/src/app/api/kb/ask/route.ts`. When `EMERGENCY_STOP=1` (or
`true`) is set, those handlers short-circuit before any DB, rate-limit, or
Gemini work and return HTTP 503 with `{ code: "EMERGENCY_STOP" }` and
`Retry-After: 3600`.

Env is read per-request so a Vercel env change plus a redeploy (or Instant
Rollback) takes effect on the next inbound request, not on the next cold
start. Read endpoints (`/api/kb/stats`, `/api/kb/budget`,
`/api/openapi.json`, `/api/health`) stay live by design so operators can still
observe state during a pause. `docs/ops/runbook.md § 9` carries the full
activate / observe / restore procedure.

### 3. `/api/kb/budget` observability surface + `C-01..C-06` in STRIDE

`apps/knowledge/src/lib/global-budget.ts` gains a `snapshotBudget(ns)` helper
that returns `{ day: { used, cap, resetInSeconds }, month: {...} }` without
mutating. A new `GET /api/kb/budget` route exposes both namespaces
(`kb-ask`, `kb-ingest`) and the current emergency-stop flag, mirroring the
`/api/kb/stats` shape. Cheap, no auth, no Gemini calls — safe for UptimeRobot
and smoke tests.

`docs/security/threat-model.md` gains a new **Cost exhaustion** section with
threats `C-01..C-06` and their concrete mitigations, so the zero-cost stance
is tracked in the same document as every other category rather than buried in
prose.

## Consequences

**What changes for a reviewer reading the repo cold**

- The cost-safety guarantee is no longer a prose claim in COST_SAFETY.md; it
  is a CI job that fails on PRs that would violate it.
- The kill switch is demonstrable: a reviewer can set `EMERGENCY_STOP=1`
  locally, `curl -X POST /api/kb/ask`, and watch the 503.
- `/api/kb/budget` makes the container's current usage visible without needing
  log access — same shape pattern as `/api/kb/stats`.
- The STRIDE model now has first-class coverage of the attack shape this
  portfolio is most exposed to (free-tier bleed).

**Trade-offs admitted**

- Container-scoped counters. `snapshotBudget` still reports per-warm-container
  state on Vercel serverless; a fleet-wide view needs the deferred
  Upstash-backed store called out in ADR-0043 / ADR-0045. This ADR does not
  attempt to close that gap.
- The blocklist is conservative on purpose. It won't catch every possible
  billable SDK (e.g. a new OpenAI paid-tier wrapper, a direct `fetch` to an
  unbounded paid API). The static check is a safety net, not a replacement
  for review.
- `EMERGENCY_STOP=1` needs an operator to flip it; there is no automatic
  trigger (e.g. "stop if `/api/kb/budget` shows `used > 0.9 * cap`"). Auto-trip
  is intentionally deferred — an auto-trip that misfires during a legitimate
  traffic spike would itself be an incident.

**What this unblocks**

- ADR-0043's deferred eval gate can be added later without re-deciding the
  surrounding cost posture.
- The threat model is now ready to be linked directly from README without
  qualification.
- Any future "can we ship X without it costing money?" review has a single
  checklist entry: does the free-tier compliance gate still pass?

## Related

- `docs/security/threat-model.md` — C-01..C-06 rows landed in this change
- `docs/ops/runbook.md § 9` — Emergency stop procedure
- `scripts/check-free-tier-compliance.mjs` — the static check
- ADR-0037 — original layered-budgets decision
- ADR-0043 — cost-guard parity + CI integration job (this ADR closes the
  claim-vs-reality gap that ADR-0043 self-identified)
