# ADR-0067: Gemini Free tier account-level revocation incident — diagnosis, containment, scope pivot (2026-04-29)

- Status: Accepted (incident report; containment in this same ratchet via EMERGENCY_STOP; recovery path = ADR at next-available-NNNN slot for alt-LLM migration)
- Date: 2026-04-29
- Tags: incident, ops, knowlex, gemini, free-tier, emergency-stop, runbook, post-mortem
- Companions: [ADR-0046](0046-zero-cost-by-construction.md) (zero-cost regime + EMERGENCY_STOP kill-switch — the structural defense this incident exercised), [ADR-0064](0064-hybrid-retrieval-calibration-architectural-gap.md) (the calibration ratchet this incident interrupted; § Status updated to reflect recovery dependency), [ADR-0065](0065-knowlex-ci-credentials-provider.md) (the CI Credentials provider shipped in this same ratchet — calibration architecture is now ready, only blocked on Gemini availability), [ADR-0061](0061-knowlex-auth-and-tenancy.md) (the prod live demo this incident temporarily disabled), [ADR-0049](0049-rag-eval-client-retry-contract.md) (the eval cron this incident pauses)

## Context

ADR-0064 named a calibration ratchet to close ADR-0011's deferred lift figure. ADR-0065 (this same ratchet) shipped the CI Credentials provider for Knowlex by mirroring apps/collab's ADR-0038 triple-gate. End-to-end, the implementation worked: the eval client successfully signed in via the new Credentials provider on the first attempt (`[eval] CI auth dance complete — signed in as e2e+owner@e2e.example`).

The first ingest call after that successful signin returned HTTP 500:

```
{"code":"Your project has been denied access. Please contact support.",
 "message":"Ingest failed: Your project has been denied access. Please contact support."}
```

A probe of the prod live demo `https://craftstack-knowledge.vercel.app/api/kb/ask` returned the same upstream-Gemini error wrapped as `{"code":"RETRIEVAL_FAILED"}` 500. The live RAG demo had been operating continuously on the same Gemini API key for ~6 days (project `gen-lang-client-0257269182`, key `...SYPw`, created 2026-04-23) and was now broken.

## Diagnosis

Inspection of the Google AI Studio console (`https://aistudio.google.com/app/apikey`) showed the existing key's project labeled with a `Billing Tier: Set up billing | Unavailable` badge. Twenty-four hours earlier (S266 verify step), the same row had read `Billing Tier: Set up billing | Free tier`. Google had silently transitioned the project out of Free tier eligibility — no email notification, no dashboard banner, no in-product warning. Only the column label changed.

A new Google Cloud project (`craftstack-knowlex-v2`, `gen-lang-client-0281398860`) was created via "Create API key in new project" to test whether project-level abuse-detection was the cause. The new key briefly showed `Free tier` in the same column for ~1 minute, then transitioned to `Unavailable` as well. The transition happened **before** any API call from this session was made against the new key.

Conclusion: the revocation is **account-level**, not project-level. Both the existing project and a freshly-created project under the same Google account share the `Unavailable` state. Adding billing (= a payment method) is offered as the only re-enablement path in the AI Studio console. The exact policy or signal that triggered the revocation is not visible from outside Google's systems; the most likely hypotheses are:

1. **Free tier policy tightening** at Google's discretion (sample size of 1, no announcement, possibly a regional or account-cohort rollout).
2. **Account-level abuse signal** triggered by the cumulative usage pattern of `gen-lang-client-0257269182` since 2026-04-23 — although that project's traffic was modest and entirely honest (the live RAG demo serving public visitors plus eval cron + manual probes), the signal could have crossed an automated threshold.
3. **Geographic / IP-pattern restrictions** newly applied to the account.

None of these are confirmable from the operator side without direct Google support contact, and even then the resolution timeline is unknown. The diagnosis the operator can make with confidence is the **observable state**: this Google account no longer has Free tier access; new projects under it inherit the same state; only `Set up billing` is offered as recovery.

### Triage with available evidence (in-session)

Three diagnostic probes were run during this incident:

1. **Vercel function logs for `/api/kb/ask` over the post-revocation window** — sparse traffic (5 entries in 30 min), no bot-pattern user-agents, no abuse-fingerprint query content, no DoS-shape volume. The visible window of traffic is consistent with normal portfolio-demo use, not abuse. **Hypothesis 2 (cumulative public-traffic abuse on craftstack /api/kb/ask) is therefore weakly supported as the primary trigger** — it cannot be ruled out for the pre-revocation window which Vercel does not retain at this granularity, but the post-revocation traffic that is visible looks normal.
2. **AI Studio Project dropdown listing** — only `craftstack-knowlex` (origin) + `craftstack-knowlex-v2` (this incident's diagnostic test) + `CR-AI-Brain` (a leftover from an unrelated experiment, no traffic). The cumulative-account-history hypothesis is therefore weakly supported — the active projects under this account are limited to craftstack itself; there is no fleet of high-traffic sibling projects whose cumulative reputation could have triggered this.
3. **AI Studio Usage page** — across all projects on this Google account, `Total API Requests`, `Total API Errors`, `Input/Output Tokens` all return "Error loading data" with a banner "Project quota tier unavailable. Please contact your project administrator for assistance." Google's intentional opacity at this layer means the operator-side cannot identify the specific request, query, or pattern that triggered the revocation. Abuse-detection systems standardly hide their triggers to prevent gaming; this is the policy in force here.

Combined with the candidate analysis above, the most operator-actionable conclusion is: **the trigger is not specifically identifiable, and continued investigation has diminishing returns**. The recovery design must be resilient to "any free-tier provider can revoke at any time without explanation" rather than fix a specific identified trigger. § Decision below leans on this insight.

## Decision

**Containment first, recovery as a separate ratchet at next-available-NNNN slot.**

ADR-0046 zero-cost-by-construction is a hard constraint of the project (the `$0/mo CI-enforced` claim is in the README, in three hiring-sim runs, and in attestation). Adding billing to retain Gemini access would violate ADR-0046 and require migration to a different free-tier provider as a recovery path anyway. Therefore:

### 1. Production containment via EMERGENCY_STOP (ADR-0046 kill-switch)

The Knowlex prod deployment exposes an `EMERGENCY_STOP` env-var-gated kill switch (apps/knowledge/src/lib/emergency-stop.ts, asserted in `_claims.json` for ADR-0046). When `EMERGENCY_STOP=1` is set on the Vercel project Environment Variables and a redeploy fires, both `/api/kb/ask` and `/api/kb/ingest` short-circuit to a 503 with `{"code": "EMERGENCY_STOPPED", "message": "Service temporarily disabled"}` — explicit "intentionally disabled" rather than the cascading 500s the broken Gemini key currently produces.

The runbook is therefore:

```
Vercel dashboard → craftstack-knowledge → Settings → Environment Variables
   → Add: EMERGENCY_STOP = 1 (Production + Preview)
   → Redeploy (env change trigger fires automatically; "Redeploy" button on the
     "Updated Environment Variable successfully" toast)
   → Verify: curl https://craftstack-knowledge.vercel.app/api/kb/ask -X POST
            -H "content-type: application/json" -d '{"question":"x"}'
     → expect 503 with {"code":"EMERGENCY_STOPPED"}
```

EMERGENCY_STOP is reverted (env var removed + redeploy) when the recovery ratchet ships and the new LLM provider is wired.

### 2. Calibration scope pivot — BYOK landing

ADR-0064's calibration follow-up cannot ship its lift figure in this ratchet because the eval flow needs to call Gemini (both for question embedding and judge-mode rubric). The structural pieces it WAS meant to deliver split:

- **CI Credentials provider for Knowlex** (the auth-bypass closure, the "infrastructure" half of ADR-0064 § Decision) → **shipped in this ratchet** as ADR-0065. End-to-end signin verified; the architectural blocker that ADR-0064 disclosed is now closed.
- **Hybrid retrieval lift figure** (the "measurement" half of ADR-0064 § Decision) → **reframed as BYOK-reproducible**. Any operator with a Gemini-compatible API key (or a free-tier alternative — Cloudflare Workers AI's `bge-base-en-v1.5` is 768-dim and compatible with the existing schema) can run `pnpm --filter knowledge eval` locally and produce the lift figure. The README's BYOK runbook documents the 5-line setup.

The graduation cycle pattern (`KL-build_ci-202604-graduation-cycle`) accommodates this gracefully: ADR-0064 had four named accelerator triggers and a hard 2026-Q3 backstop. The trigger that fires now is **infrastructure-incident-driven** rather than reviewer-question-driven, but the closure path was always "do the calibration work post-CI-Credentials". Half of that work shipped (ADR-0065); the other half is reproducible by any BYOK operator without further code changes.

The portfolio brand effect is preserved (and arguably strengthened): rather than "we shipped + we measured + we have the number Z", the narrative is "we shipped + we built the calibration infrastructure + a production incident hit + we contained it + the calibration is BYOK-reproducible from the runbook". The latter is canonical operational maturity.

### 3. Recovery ratchet — optional, deferred to demand-trigger

A future ratchet (next-available-NNNN slot) MAY be authored to:

- Survey free-tier-compatible LLM/embedding providers (HuggingFace Inference API, Cloudflare Workers AI, Cerebras, Groq, Together AI free tier, etc.) for cost/quality/CC-required tradeoffs.
- Implement a thin provider abstraction in `apps/knowledge/src/server/` so embedding + generation calls can be re-pointed without re-architecting the route handlers.
- Re-point the embedding model to the chosen provider's nearest-equivalent (Cloudflare Workers AI `bge-base-en-v1.5` is 768-dim, matching the existing schema; no corpus re-embed needed if that provider is selected).
- Re-run the calibration eval against the new provider and produce a published `lift.md`.
- Remove EMERGENCY_STOP from the Vercel env so the live demo restoration is atomic with the recovery.

This is **NOT** committed in this ratchet. The BYOK landing (§ 2 above) discharges ADR-0064's closure obligation via a different but equally honest path. The recovery ratchet is a needs-driven optional follow-up:

- **If** an external eval reviewer asks for live calibration data (= ADR-0064 accelerator trigger #1 fires) → recovery ratchet activated.
- **If** any operator (including the portfolio author) wants the live demo restored without BYOK friction → recovery ratchet activated.
- **If** 2026-Q3 arrives without recovery → ADR-0067 is re-audited per ADR-0059 § 3-trigger backstop.

Otherwise, the v0.5.15 BYOK landing is the steady state.

### 4. Why NOT add billing

Three reasons:

- **ADR-0046 hard constraint**. Zero-cost-by-construction is not a "while convenient" stance; it's a regime claimed in README + portfolio-lp + attestation. Violating it for incident recovery would damage the brand more than EMERGENCY_STOP + recovery ADR.
- **Cost-attack vector re-opens**. Once billing is attached, an unauthenticated /api/kb/ask traffic spike (which the live demo's /api/kb/ask intentionally accepts) could rack up genuine spend. The `requireMemberForWrite` cost-attack closure in ADR-0061 was designed for the Free-tier regime; the same regime falling away changes the threat model.
- **Lock-in to Google**. Migrating to a different provider is structurally cleaner than negotiating with Google's billing and abuse systems case-by-case.

## Consequences

### Positive

- **Live demo state is honest, not broken**. Once EMERGENCY_STOP fires, a portfolio visitor sees an explicit "service temporarily disabled" rather than a confusing 500. Reviewer-readable as engineering discipline, not as breakage.
- **ADR-0046 zero-cost regime preserved**. The structural defense the project committed to held under stress; the kill-switch shipped 6 months ago for exactly this contingency was the right call retrospectively.
- **Incident record signals operational maturity**. A portfolio without prod incident records is silent on "have you handled real production failures?" — a question Senior+ reviewers ask. ADR-0067 + the runbook + the recovery ratchet together demonstrate diagnosis → containment → scoped pivot → recovery plan, the canonical incident-response flow.
- **ADR-0064 closure path remains intact**. The graduation cycle pattern (`KL-build_ci-202604-graduation-cycle`) is robust to this kind of interruption: the disclose-with-TTL gives the closure flexibility, accelerator triggers expanded to include "infrastructure incident", and the closure ratchet will land via ADR-NNNN-recovery + lift figure.
- **ADR-0065 still ships**. The CI Credentials provider work is structurally complete and end-to-end verified (the auth dance succeeded; only the downstream Gemini call failed). The ADR-0064 architectural-gap half closes regardless of the calibration data.

### Negative

- **Live RAG demo is unavailable until recovery ratchet lands**. The strongest 30-second hiring-sim probe on Knowlex (paste a question, see streamed Gemini answer with citations) is blocked. Mitigated by: (a) explicit EMERGENCY_STOP message naming this ADR, (b) attestation endpoint still works (`https://craftstack-knowledge.vercel.app/api/attestation`) so brand-defining numerics + corpus state remain readable, (c) attached docs (ADR-0061, ADR-0063, ADR-0064 + 0065 + this) show the implementation depth even without the runtime demo.
- **Calibration lift figure remains unmeasured**. ADR-0064's TTL extends from the hard 2026-Q3 backstop to "ADR-NNNN-recovery + post-recovery calibration run", which could be sooner or later depending on the recovery ratchet's pace.
- **Migration scope is non-trivial**. Re-pointing embedding + generation to a non-Gemini provider may require corpus re-embedding (different vector dimension), prompt re-engineering (different model behavior), threshold re-calibration on the golden eval. Recovery ratchet is medium-scope, not single-session.
- **The "free tier" assumption was load-bearing across the project**. ADR-0046 zero-cost regime, the README, portfolio-lp, and the cost-claim line all rest on Free tier infra. The recovery ratchet must reassert this with a new provider; if no free-tier-compatible provider survives the survey, the constraint itself is at risk. Honest risk to flag.

### Neutral

- **No spend was incurred during the incident**. AI Studio Free tier doesn't bill on overage; the deny-access path produces 500s, not invoices. AI Studio dashboard showed `0 requests / 0 cost` for both projects across the incident window. ADR-0046 verify-of-verify holds.
- **Local calibration container teardown**. The local `knowlex-pg` Docker container + the migrator Postgres role go away with this ratchet (already torn down at the end of the session). No residual local state.

## Alternatives

- **Add billing to the existing Google account**. Rejected — ADR-0046 violation; cost-attack vector re-opens (see § Decision item 4); doesn't actually solve the underlying "this account is on Google's bad list" signal so re-revocation could happen post-billing.
- **Create a different Google account**. Rejected — likely against Google ToS to circumvent account-level enforcement; even if it worked transiently, the same automated systems would likely re-flag.
- **Wait passively for Free tier to be restored**. Rejected — no signal it will be, no SLA, no support ticket path for AI Studio Free tier (it's a courtesy product). Indefinite live-demo downtime damages brand.
- **Disable knowledge entirely + remove from portfolio README**. Rejected — overcorrection. The implementation work, the ADR depth, and the test surface are still valuable signal. EMERGENCY_STOP + ADR-0067 documentation preserves all of that while honestly disclosing the runtime state.
- **Implement EMERGENCY_STOP + recovery in the same ratchet (this ADR + alt-LLM migration combined)**. Rejected — the alt-LLM migration is its own scope (provider survey + abstraction + re-embed + re-calibrate + restoration) and bundling it with the containment ADR violates the discipline that EACH ratchet stays single-purpose. Containment ships now; recovery ships next.

## Implementation status

Shipped in v0.5.15 (this ratchet, alongside ADR-0065):

- `docs/adr/0067-gemini-free-tier-account-revocation-incident.md` — this file.
- `docs/adr/0064-hybrid-retrieval-calibration-architectural-gap.md` — § Status updated: calibration data deferred to ADR-NNNN-recovery + post-recovery eval; the architectural-gap half closed by ADR-0065.
- `docs/adr/0065-knowlex-ci-credentials-provider.md` — § Implementation status updated: end-to-end signin verified; calibration data dependent on ADR-0067 recovery ratchet.
- `README.md` + `docs/hiring/portfolio-lp.md` — Knowlex live-demo links replaced/annotated with "Live demo temporarily disabled — see ADR-0067" and a pointer to attestation endpoint as the still-readable signal.
- `docs/adr/README.md` — index entries for ADR-0065 and ADR-0067.
- `docs/adr/_claims.json` — ADR-0067 entries asserting EMERGENCY_STOP wiring + the demo-disabled README annotation are structurally present.
- `CHANGELOG.md` — `[0.5.15]` entry covering the incident pivot scope.
- `apps/knowledge/.env` — `GEMINI_API_KEY` value cleared post-incident.

### User-side action (cannot be performed by AI in this ratchet)

- Set `EMERGENCY_STOP=1` on the Knowlex Vercel project Environment Variables (Production + Preview) and trigger a redeploy. The runbook is in § Decision item 1.
- Verify post-redeploy: `curl https://craftstack-knowledge.vercel.app/api/kb/ask` returns `{"code":"EMERGENCY_STOPPED"}` 503 instead of cascading 500s.

### Verification

```bash
node scripts/check-doc-drift.mjs          # → 0 failure (ADR 65, Vitest 274 = 174 collab + 100 knowledge)
node scripts/check-adr-claims.mjs         # → all pass; ADR-0065 + ADR-0067 entries hold
node scripts/check-adr-refs.mjs           # → 0 dangling (ADR-NNNN-recovery placeholder uses non-regex string form)

# Post-EMERGENCY_STOP verification (user-side, then operator-confirmed):
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "content-type: application/json" -d '{"question":"x"}' \
  https://craftstack-knowledge.vercel.app/api/kb/ask
# → expect 503
```

The recovery ratchet (`docs/adr/NNNN-knowlex-alt-llm-provider-migration.md`, slot reserved at the next available number after this ratchet lands) is named here as a follow-up. Do not implement in this ratchet (single-purpose discipline; § Alternatives item 5).
