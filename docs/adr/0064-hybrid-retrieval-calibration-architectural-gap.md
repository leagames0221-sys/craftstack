# ADR-0064: Hybrid retrieval calibration — architectural-gap discovery (post-v0.5.14 retrospective)

- Status: Accepted (calibration attempted, lift figure deferred pending the next-available-NNNN follow-up that closes the eval auth-bypass gap named in ADR-0061 line 52)
- Date: 2026-04-29
- Tags: rag, retrieval, knowlex, calibration, hybrid, eval, multi-tenant, honest-disclose
- Companions: [ADR-0011](0011-hybrid-search-rerank.md) (the design-phase plan; § Status updated to reflect calibration-blocked-pending-NNNN-follow-up), [ADR-0061](0061-knowlex-auth-and-tenancy.md) line 52 (the CI Credentials provider for Knowlex named as "if and when" follow-up — the architectural gap this calibration attempt surfaced), [ADR-0063](0063-hybrid-retrieval-bm25-rrf.md) (the v0.5.14 ship that this calibration was meant to retrospectively measure; § Implementation status gains the calibration-blocked note), [ADR-0059](0059-audit-framework-v1-freeze.md) (the 3-trigger ratchet rule this ADR honors by NOT implementing the bypass mechanism in this ratchet), [ADR-0046](0046-zero-cost-by-construction.md) (zero-cost compliance — calibration ran on local Postgres + free-tier Gemini, no cost incurred)

## Context

ADR-0063 (v0.5.14 / 2026-04-28) shipped hybrid retrieval (Postgres FTS + pgvector kNN fused via RRF) behind `HYBRID_RETRIEVAL_ENABLED=1` env flag, default off. The ADR explicitly named a calibration run as the v0.6.0 follow-up: measure the hybrid lift on the golden corpus, decide whether to flip the env-flag default to `1`, and document the calibration data in a future ADR. That note appears in three places:

- ADR-0011 § Implementation status: "the 'Context Precision 0.62 → 0.89' target below remains a design target until a future calibration ADR (next available NNNN) measures the actual hybrid lift"
- ADR-0063 § Negative consequence #1: "`HYBRID_RETRIEVAL_ENABLED` is not yet calibrated against the golden corpus"
- CHANGELOG v0.5.14: "until a future calibration ADR (next available NNNN) measures the hybrid lift on the golden corpus"

This ADR is the calibration attempt. It is being written because the calibration ran into an architectural gap — not because the calibration produced a numerical lift figure.

## Discovery

Calibration was attempted as a local 2-run comparison (HYBRID_RETRIEVAL_ENABLED=0 vs =1), holding everything else constant: same Postgres instance (local pgvector/pgvector:pg16 container with all 5 prisma migrations applied), same eval golden corpus (v4 / 30 questions), same `--judge` mode (`EVAL_JUDGE=1` with `gemini-2.5-pro`). The intent was to compute lift on `passRate`, `latency p50/p95`, and `judge.meanScore`, with per-question diff for class-of-query analysis (keyword-heavy vs paraphrase-heavy).

The first ingest call failed with HTTP 401:

```
{"code":"UNAUTHENTICATED","message":"Sign in to ingest documents."}
```

ADR-0061 line 32 names this as designed behavior:

> Always requires a signed-in session, even for the demo workspace. **Anonymous writes are explicitly disallowed** — this closes the cost-attack vector

ADR-0061 line 52 names the corresponding gap on the eval side as a deferred follow-up:

> The CI-only Credentials provider from apps/collab (ADR-0038) is intentionally **not** replicated yet — the Knowlex E2E surface is still public-demo + smoke. **If and when** an authed Playwright suite lands on Knowlex, the same triple-gate pattern (`VERCEL!=1 + E2E_ENABLED=1 + E2E_SHARED_SECRET`) can be copied across.

The pre-v0.5.12 baseline at `docs/eval/reports/2026-04-27.json` (passRate 80%, p50 2311ms, p95 8221ms, against `https://craftstack-knowledge.vercel.app`) was captured before ADR-0061's auth gate landed, so the eval ran end-to-end against a then-anonymous ingest. Post-v0.5.12, a re-run of the same eval against either prod or local-with-fresh-DB requires a session — and the eval client (`apps/knowledge/scripts/eval.ts`) is unauthenticated by design.

The architectural gap is therefore: **the calibration-run mechanism named as a v0.6.0 follow-up by ADR-0011 / ADR-0063 / CHANGELOG-v0.5.14 implicitly assumed pre-v0.5.12 ingest semantics.** Post-v0.5.12 the calibration cannot be executed without first closing the eval auth-bypass gap named in ADR-0061 line 52.

## Decision

Accept the gap. Disclose it as a TTL'd graduation-cycle item per ADR-0059 § honest-disclose TTL pattern. Do **not** implement the CI Credentials provider for Knowlex in this ratchet, because:

1. **ADR-0059 § 3-trigger ratchet rule compliance.** Audit framework v1.0 is frozen. New ratchets require one of: real incident, external feedback, 2026-Q3 re-audit window. A self-audit-discovered gap that produces "we want to ratchet now" is exactly the self-audit-loop trap the freeze rule is designed against (`KL-postmortem-202604-self_audit_loop_trap`).
2. **Scope honesty.** Replicating the apps/collab triple-gate (`VERCEL!=1 + E2E_ENABLED=1 + E2E_SHARED_SECRET`) for apps/knowledge is a medium-scope change: a new auth provider registration, an E2E-only route, an env-driven session-injection in `eval.ts`, and a new ADR documenting the auth shape. That is its own ratchet, not a sub-task of "run calibration".
3. **Graduation cycle integrity.** ADR-0059's pattern is `disclose → date-bound revisit → actual ship`. Implementing the bypass on the same day the gap is discovered would skip the date-bound-revisit step and reduce the pattern to ad-hoc reflex. The disciplined move is to disclose, name the TTL, and let the trigger fire when it actually fires.

The closure path is therefore named here as a follow-up: a future ADR at the next-available-NNNN slot ships the CI Credentials provider for Knowlex, copying the apps/collab triple-gate pattern, and that ADR's calibration-run section produces the actual lift figure that this ADR was meant to produce.

### TTL

- **Ship date or 2026-Q3 re-audit window, whichever comes first.** The 2026-Q3 window is ADR-0059's structural backstop for any disclosed item — even without an accelerator trigger, this disclose gets re-evaluated then.

### Accelerator triggers (any one fires the closure ratchet ahead of schedule)

- **External eval reviewer questions** the absence of calibration data on a hiring-sim run, code review, or recruiter probe.
- **Default-flip request** — anyone (operator, hiring reviewer, future contributor) wants `HYBRID_RETRIEVAL_ENABLED=1` to be the default. The default-flip cannot land without calibration data, so this trigger forces the closure.
- **Authed Playwright suite for Knowlex** lands for any other reason (e.g. testing a v0.6.0 personal-workspace UX). Once that ships, the CI Credentials provider becomes free byproduct and calibration unblocks at zero marginal cost.
- **Corpus growth** past ~100 documents on the live deploy. The current 13-doc corpus is too small for hybrid lift to be unambiguously measurable; at ≥100 docs the signal-to-noise ratio improves enough that calibration is worth doing even if the auth-provider work stays as-is.

## Consequences

### Positive

- **Honest scope note converts into a TTL'd graduation-cycle item.** ADR-0011 / ADR-0063 / CHANGELOG-v0.5.14 had a "future calibration ADR (next available NNNN)" placeholder. This ADR fills the placeholder with the actual calibration-attempt outcome (= blocked, with named closure path and TTL), instead of leaving a permanent unfulfilled promise.
- **Discipline visible to a reviewer.** A reader following the ADR sequence sees: ship hybrid (ADR-0063) → attempt calibration (ADR-0064) → discover gap → disclose with TTL + accelerator triggers + closure ADR named. The graduation cycle pattern is in operation, not aspiration.
- **Cost-attack vector preservation.** The decision NOT to bypass auth for the eval run preserves ADR-0061's explicit cost-attack closure. An eval-bypass that gets accidentally enabled on prod (e.g. via env-var typo) would re-open anonymous ingest. Deferring the bypass implementation to its own ADR — with its own threat model + triple-gate enforcement — keeps the security perimeter intact.
- **5th graduation cycle seed established.** T-01 (v0.5.11) → I-01 (v0.5.12) → ADR-0049 § 8th arc (v0.5.13) → ADR-0011 (v0.5.14) → calibration-attempt-blocker (this ADR) is now in queue for the 5th closure when the next-available-NNNN follow-up ships. The brand pattern (`KL-build_ci-202604-graduation-cycle`) is reinforced rather than spent.

### Negative

- **No numerical lift figure produced.** The actual `passRate / p50 / p95 / judgeMean` deltas between hybrid-on and hybrid-off remain unknown. Anyone asking "did v0.5.14's hybrid retrieval improve quality?" gets "the mechanism shipped; calibration is gated on the next-available-NNNN follow-up" — which is honest but less satisfying than "+X% pass rate, +Y judge points, deployed-default flipped". The TTL + accelerator triggers ensure the lift figure does land eventually.
- **Operator who attempts the same calibration recipe will hit the same 401.** ADR-0063 § Verification line 134-144 documents the calibration command. Until the next-available-NNNN follow-up ships, that command does not actually work post-v0.5.12. ADR-0063 § Implementation status is updated in this same commit to add the calibration-blocked-pending-NNNN-follow-up note so the operator finds out from the doc, not from a 401.
- **Verify-of-verify limitation surfaced** (operator-side, not framework-side). Three sequential false-go signals appeared during the session that produced this ADR:
  - A `sed 's/=.*/=<SET>/'` env-check declared `GEMINI_API_KEY=<SET>` even when the value was empty (length-zero passed the substitution).
  - Vercel's masked-display copy yielded UTF-8 bullet bytes (`e2 80 a2`) that looked like a 45-character "key" until raw-byte inspection.
  - The architectural pre-condition (post-v0.5.12 ingest auth) was visible in ADR-0061 from day 1 but was not part of any structural pre-flight check.

  The framework-foundation axiom from `KL-postmortem-202604-framework_foundation_axiom` ("a framework that asserts X must also assert that X is structurally enforced") applies recursively to the operator's verification step. A future ratchet candidate (parallel to the next-available-NNNN follow-up, not blocking it) is to add a `pnpm --filter knowledge calibration-preflight` script that asserts: `GEMINI_API_KEY` length ≥ 30 and starts with `AIza`, ingest endpoint returns 200 on a synthetic POST, all 5 migrations applied, `HYBRID_RETRIEVAL_ENABLED` env round-trips to the running server. This is a separate disclose, named here for completeness; not promoted to its own ADR until either the calibration follow-up triggers or 2026-Q3.

### Neutral

- **Cost incurred during the calibration attempt: 0.** The local Postgres container was free (Docker Desktop), the dev-server build was free (Next.js 16 turbopack), the API key is on AI Studio Free tier (verified via the AI Studio "API keys" page showing "Set up billing | Free tier" for the project `gen-lang-client-0257269182`). The eval halted at the ingest 401 before any embedding call was made — Gemini API request count for the calibration session: 0. ADR-0046 zero-cost compliance preserved.
- **Local container teardown is part of this commit chain.** `docker stop knowlex-pg && docker rm knowlex-pg` runs after this ADR lands, per the tool-cleanup discipline (no calibration-time artifacts persist past the session). The `migrator` Postgres role created in the local container goes away with the container.

## Alternatives

- **Implement the CI Credentials provider for Knowlex now and run the calibration in this same ratchet.** Rejected per § Decision item 1: ADR-0059 § 3-trigger rule is satisfied by none of the three valid triggers. A self-audit-discovered gap is not an "incident" or "external feedback", and 2026-Q3 has not arrived. Doing it now is the self-audit-loop trap.
- **Run calibration against prod with `HYBRID_RETRIEVAL_ENABLED=1` toggled on the Vercel project env.** Rejected: prod env-flag flip would disturb the live demo's eval cron (next nightly run would be measured under hybrid-on, breaking comparability with the historical pure-cosine baseline ADR-0063 § Default-off discipline explicitly preserves). Also disturbs prod observability for non-calibration purposes.
- **Skip writing this ADR and leave the existing "next available NNNN" placeholders unfulfilled.** Rejected: that converts a TTL'd disclose into an open-ended one — exactly the perpetual-disclose failure mode the graduation cycle is designed against. The placeholder text in three places already names this ADR's slot; not writing it would leave audit-survivability evidence missing.
- **Implement only the env-driven session-injection in `eval.ts` (not the full Credentials provider).** Rejected: the ingest route enforces `requireMemberForWrite` from ADR-0061, which checks `Membership` rows, which require an actual signed-in user (the upsert path on first write to demo workspace triggers from a session). A session-injection without an underlying provider is mock-state at the session-store layer that ADR-0061 explicitly designed against.

## Implementation status

Shipped in v0.5.15-rc.0 (this ratchet):

- `docs/adr/0064-hybrid-retrieval-calibration-architectural-gap.md` — this file.
- `docs/adr/0011-hybrid-search-rerank.md` — § Implementation status updated: the "next available NNNN" placeholder is replaced with explicit calibration-blocked-pending-NNNN-follow-up wording referencing this ADR.
- `docs/adr/0063-hybrid-retrieval-bm25-rrf.md` — § Implementation status gains a calibration-blocked-pending note pointing at this ADR + the next-available-NNNN follow-up.
- `docs/adr/README.md` — index entry for ADR-0064.
- `docs/adr/_claims.json` — ADR-0064 entries asserting the architectural-gap is structurally visible:
  1. ADR-0061 contains the "intentionally **not** replicated" prose naming the eval-bypass gap as future work.
  2. The eval client (`apps/knowledge/scripts/eval.ts`) makes unauthenticated calls to `/api/kb/ingest` (= the gap surface).
  3. The CHANGELOG entry exists.
- `CHANGELOG.md` — `[Unreleased]` → `## [0.5.15-rc.0]` with calibration-record entry. Tag drift cleanup (`v0.5.9..v0.5.14` not pushed to origin per the S266 entry-state finding) bundled in the same ratchet.
- `apps/knowledge/.env` — `GEMINI_API_KEY` value cleared (gitignore'd; on-disk attack-surface reduction per the tool-cleanup discipline).

### Verification

```bash
node scripts/check-doc-drift.mjs          # → 0 failures (ADR 63, Vitest 265 unchanged)
node scripts/check-adr-claims.mjs         # → all pass; ADR-0064 _claims.json entries present
node scripts/check-adr-refs.mjs           # → 0 dangling
git tag --list 'v0.5.*'                   # → v0.5.8..v0.5.14 reachable
git ls-remote --tags origin | grep v0.5   # → all tags pushed
```

The calibration-record artifact (the lift figure that this ADR was originally meant to produce) does not yet exist in `docs/eval/reports/calibration/`. When the next-available-NNNN follow-up ships, that ADR's § Implementation status will produce `baseline.json` + `hybrid.json` + a `lift.md` per-question-diff summary in that directory.
