# ADR-0037: Layered cost-attack hardening with in-code invocation budgets

- Status: Accepted
- Date: 2026-04-23
- Tags: security, cost, rate-limit, reliability

## Context

Multi-tenant SaaS that talks to a pay-per-use LLM is a live cost-attack target. Japan recently saw a cluster of incidents where a single weekend of abuse translated into five-figure bills (AWS S3 presigned-URL bandwidth theft, Firebase read-loops, Cloud Run auto-scale into paid tier). The common pattern: the service's failure-mode-under-load is **"auto-scale to the attacker's credit card"** rather than **"cap out to zero cost"**.

This repo targets the second failure mode end-to-end. Every external dependency (Vercel Hobby, Neon, Gemini via AI Studio, Pusher, Resend, GitHub Actions) is on a free tier that hard-stops at quota rather than billing the overage. That's necessary but not sufficient — an operator could still wire `GEMINI_API_KEY` against a billing-enabled Google Cloud project instead of the recommended AI Studio key, and the public `/api/kb/ask` endpoint would then become an open door.

## Decision

Ship **layered, in-code invocation budgets** as belt-and-suspenders on top of the external-service guarantees, for the single public cost-sensitive route:

1. **Per-IP sliding window** (`lib/kb-rate-limit.ts`): 10 req / 60s on `/api/kb/ask`. Stops trivial drive-by floods from one source.
2. **Global daily + monthly budget** (`lib/global-budget.ts`): 800/day, 10,000/month across **all** `/api/kb/ask` callers, per container. Defense-in-depth for the "operator misconfigured the key" scenario — even with a billing-enabled key, the monthly ceiling caps real-world spend at single-digit USD worst case.
3. **Google AI Studio's own 1500 RPD** on the key itself (free-tier-locked if generated via AI Studio): the outermost guarantee. Physically cannot be exceeded on the recommended setup.

For authenticated read-heavy routes (`/api/search`, `/api/notifications`) that could burn Neon compute hours from a spamming signed-in tab, add **per-user sliding windows** (`lib/user-rate-limit.ts`): 60/60s for search, 30/60s for notifications.

Document the full threat model + operator setup rules in [`COST_SAFETY.md`](../../COST_SAFETY.md), linked from `SECURITY.md` and the project README.

## Consequences

Positive:

- Portfolio can truthfully claim "$0/month under adversarial traffic."
- The stack is conspicuously designed against the specific attack patterns interviewers have been reading about in 2026.
- Explicit `BUDGET_EXCEEDED_DAY` / `BUDGET_EXCEEDED_MONTH` error codes give operators a clear signal before any real bill arrives.
- Pure in-memory state means zero dependency on an external limiter (no Upstash / KV needed on Hobby).

Negative:

- In-memory state is **per Vercel container**. The effective cap is `budget × warm-container-count`, not a true global bound. Acceptable at portfolio scale; production would migrate to Vercel KV or Upstash.
- The budget numbers are hard-coded defaults; misconfiguring the env-override is the new foot-gun (though a _higher_ cap doesn't bypass the upstream AI Studio ceiling if the operator followed the key-generation rule).
- Adds a small amount of code on the hot path. Microseconds per request, negligible.

## Alternatives Considered

- **Trust the external free-tier caps, ship no in-code limiter**. Rejected — the whole point is to guard against the scenario where those caps are circumvented by operator misconfiguration.
- **Vercel KV / Upstash for a true-global counter**. Rejected at this scale; the in-memory approximation is strictly better than nothing and costs zero dependencies. Migrate when it matters.
- **Require the operator to pre-provision billing alerts in the LLM provider dashboard**. Rejected — out-of-band controls don't enforce themselves; the in-code layer is always on.
- **Hard-disable `/api/kb/ask` when `GEMINI_API_KEY` is set but appears paid-tier**. There's no reliable runtime signal for "this key is billable"; not actionable.

## Related

- [`COST_SAFETY.md`](../../COST_SAFETY.md) — full operator-facing threat model
- [ADR-0027](0027-three-layer-invitation-rate-limit.md) — the pattern precedent for three-layer rate limits on invitation creation
- [ADR-0032](0032-mention-resolution-and-env-guarded-integrations.md) — env-guarded integrations: the upstream principle that makes "no key = no cost" possible
