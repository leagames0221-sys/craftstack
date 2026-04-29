# ADR-0068: Run #5 hiring-sim findings closure — attestation reflexivity, CSP description coherence, and grep-based-count blind-spot post-mortem (2026-04-29 / v0.5.18)

- Status: Accepted
- Date: 2026-04-29
- Tags: hiring-sim, drift-detect, attestation, csp, methodology, reflexivity, post-mortem
- Companions: [ADR-0054](0054-doc-drift-detect-ci-gate.md) (the doc-drift gate this ADR's reflexivity assertions slot into), [ADR-0056](0056-attestation-endpoint.md) (the `/api/attestation` endpoint this ADR closes a self-contradiction on), [ADR-0057](0057-drift-framework-completeness.md) (the 13-axis framework this ADR adds an axis to: framework-eats-its-own-output reflexivity), [ADR-0040](0040-csp-rollback-to-static-unsafe-inline.md) (the CSP decision whose README description this ADR brings back into coherence), [ADR-0011](0011-hybrid-search-rerank.md) (the deferred-then-shipped feature whose attestation entry was the load-bearing M1 finding), [ADR-0061](0061-knowlex-auth-and-tenancy.md) (the multi-tenant transition whose ADR-0010 RLS reason text went stale)

## Context

Hiring-sim Run #5 (2026-04-29, methodology v2 against `main @ 7a93898` = v0.5.17) returned `hire`, NOT the expected `strong hire`. The verdict capped at `hire` because methodology v2's claim-vs-implementation cross-check stage surfaced three medium-grade drift findings the post-incident BYOK-landing portfolio had not anticipated:

- **Finding A** (load-bearing): `apps/knowledge/src/lib/attestation-data.json` `scope.deferred[]` listed both `Hybrid search (BM25 + vector via RRF)` (with `adr: ADR-0011`) and `PostgreSQL RLS` (with reason text "Knowlex is single-tenant per ADR-0039"). ADR-0011's own Status field reads "Fully Accepted (2026-04-28) — hybrid + RRF shipped in v0.5.14 per ADR-0063". Knowlex transitioned to multi-tenant per ADR-0061 in v0.5.12. The endpoint built explicitly to expose audit-survivable truth (recorded in ADR-0056) was lying about a feature whose ADR says it shipped, and citing as rationale a tenancy model the project moved off five releases ago. Internal contradiction inside the auto-attestation surface.
- **Finding B** (methodology hole): The simulator measured Vitest count via `find apps -name '*.test.ts' \| xargs grep -hcE '^\s*(test\|it)\(' \| awk '{s+=$1} END {print s}'` and got 258 (159 collab + 99 knowledge), reporting drift against the README's claim of 274 (174 collab + 100 knowledge). The actual Vitest count via `pnpm exec vitest run --reporter=json` is **174 collab + 100 knowledge = 274 — the README is correct**. (Self-correction recorded in ADR-0069 § Finding D2: this very paragraph contained "+100=274" in v0.5.18 ship while the post-v0.5.18 reality became 174+102=276 due to the 2 new reflexivity tests added in this same ratchet — drift inside the drift-closure ADR. ADR-0069 closes this self-typo.) The grep-based methodology silently undercounts by missing `test.each([...])` / `it.each([...])` row-multiplied cases that Vitest expands at runtime. False positive. (See § Decision item B for what this means for methodology v3.)
- **Finding C** (small-but-real): The live response `script-src` directive includes both `'unsafe-inline'` AND `'unsafe-eval'`, but the README "Security headers" bullet only mentioned `'unsafe-inline'`. ADR-0040 itself already disclosed `'unsafe-eval'` in § Decision + § Consequences (the simulator's claim that ADR-0040 was silent on this was wrong); the actual drift was confined to the README description.

The closing observation in the simulator's verdict ([doc 63](../../.claude/other-projects/craftstack/63_hiring_sim_run_5_2026-04-29.md) Stage 3 net):

> This is a portfolio that has built a sophisticated drift-detection framework (ADR-0054 doc-drift-detect, ADR-0057 13-axis framework, claim cross-check script) and then **the framework missed live drift in its own attestation endpoint**. That is the most interesting finding.

This is brand-foundation drift: the candidate's own structural-enforcement infrastructure failed on its own substrate. Closing Findings A + C without addressing the meta-finding would close the symptoms while leaving the underlying class re-emergent on the next ratchet.

## Decision

### A. Close Finding A by structurally pinning auto-attestation reflexivity

1. **Regenerate `attestation-data.json` so `scope.deferred[]` no longer contains shipped features**:
   - Remove the `Hybrid search (BM25 + vector via RRF)` entry (shipped v0.5.14 per ADR-0063, default-off behind `HYBRID_RETRIEVAL_ENABLED` pending calibration per ADR-0064 / ADR-0065).
   - Update the `PostgreSQL RLS` entry's `reason` text to reference ADR-0061's multi-tenant transition + the application-side enforcement decision over RLS, replacing the stale "Knowlex is single-tenant per ADR-0039" text.
   - Update the `Cohere Rerank` entry's `reason` to reference ADR-0046 zero-cost-by-construction directly (independent of the v0.5.14 hybrid retrieval ship), since Cohere stays deferred for a different reason than the original ADR-0011 MVP scope.
2. **Add a new `scope.shippedFlagGated[]` section** to capture features that are fully built but default-off behind an env flag — distinct from `deferred` (not in the codebase) and from `shipped` (default-on). The hybrid retrieval entry moves here. Each entry records `feature` + `adr` (original deferral) + `closingAdr` (the ADR that shipped it) + `shippedIn` (version) + `flag` (env var) + `flagDefault` (off / on).
3. **Add a structural reflexivity gate** as a new Vitest case in `apps/knowledge/src/app/api/attestation/attestation-data.test.ts`: `scope.deferred[] entries do not contradict their ADR Status`. The assertion reads each `entry.adr`'s ADR file, extracts the Status line, and fails if the status reads `Fully Accepted` or `Accepted (shipped)` UNLESS the status text explicitly carves out the entry's feature keyword as still-deferred (e.g., ADR-0011 says "Fully Accepted ... Cohere Rerank still deferred" — the test passes for the Cohere entry because both `Cohere` and `still deferred` appear in the status). This catches the M1 drift class structurally: any future regression where a deferred entry's ADR closes will fail the test at PR time.
4. **Add a schema test** for `scope.shippedFlagGated[]`: every entry must have `feature`, `adr`, `closingAdr ≠ adr`, `shippedIn`, `flag`, `flagDefault`. Without this shape the section loses its specificity and degrades to redundant `deferred`-by-another-name.
5. **Sync `docs/architecture/system-overview.md` § "What is not in this diagram"** to describe hybrid retrieval as shipped + flag-gated rather than deferred. Add a brief note explaining why a shipped-but-flag-gated feature is still in this list (the diagram describes default-config request flow, not the full code surface).

### B. Record Finding B as the methodology v3 trigger; do not change the README

The README's "274 (174 + 100)" is correct. The simulator's grep-based undercount is the methodology v2 hole. Leaving the README unchanged is the right call.

The surface-area covered by `scripts/check-doc-drift.mjs` already includes Vitest count via `vitestCount(app)` which runs `pnpm --filter ${app} test` and parses `Tests N passed` from the actual runner output (see `scripts/check-doc-drift.mjs:62-93`). A future regression where the README drifts vs. the actual count would fail this gate at PR time. The gate is doing its job; the simulator's local methodology was the source of the false-positive. **Existing infrastructure validated.**

For methodology v3 (next session — or when hiring-sim Run #6 lands):

1. Replace the grep-based count heuristic in the v2 prompt with a directive to run the same command CI uses: `pnpm --filter <app> test` + parse summary line, OR `pnpm exec vitest run --reporter=json --outputFile=...` + parse `numTotalTests`. Document this in the [postmortem doc 64](../../.claude/other-projects/craftstack/64_hiring_sim_run5_postmortem_2026-04-29.md) as the v3 grep-blind-spot fix.
2. Add a Stage 2.5 (auto-attestation reflexivity) instructing the simulator to grade auto-attestation surfaces against their own claims, not just against the README. This formalizes the meta-finding the simulator surfaced incidentally.
3. Add a Stage 4.5 (framework-eats-its-own-output verification) requiring the simulator to evaluate whether the candidate's structural-enforcement infrastructure holds its own substrate to the same standard.
4. Add a brand-reflexivity verdict multiplier: if the candidate's brand explicitly invokes "structural enforcement" / "audit-survivable" framing AND Stage 2.5 finds drift in the foundation itself, the verdict cannot exceed `hire` regardless of two-axis sub-scores.

### C. Close Finding C by structurally pinning README-vs-CSP coherence

1. **Update README:175** to disclose `'unsafe-eval'` alongside `'unsafe-inline'` in the "Security headers" bullet, with rationale (Vercel Speed Insights uses `eval()` at runtime). Reference ADR-0040 § Decision + § Consequences for the source decision.
2. **Update `apps/collab/next.config.ts:11-30` comment** to enumerate both directives, explain why each is present (Next bundler inline scripts vs Vercel Speed Insights eval), and reference the new gate that pins this coherence.
3. **Add `scripts/check-csp-coherence.mjs`** as a PR-blocking gate. Forward direction: every load-bearing CSP directive (`'unsafe-inline'`, `'unsafe-eval'`, `'strict-dynamic'`, `'wasm-unsafe-eval'`) present in the live `apps/collab/next.config.ts` `CSP` constant must appear in the README "Security headers" bullet. (A reverse direction — "directive mentioned in README but not present" — was attempted and removed: legitimate historical context like "rolled back from the earlier `'strict-dynamic'` stance" is hard to distinguish from a stale claim by static text scan. Forward coherence is the load-bearing assertion; reverse coherence stays a review responsibility.)
4. **Wire the gate into `.github/workflows/ci.yml`** as a step in the existing `doc-drift-detect` job, after `check-adr-claims`. PR-blocking like its siblings.
5. **Update `attestation-data.json.claims.cspNote`** to disclose the dual-directive posture, mirroring the README change so the auto-attestation surface stays coherent with the README it references.

### D. Close the meta-finding by adding the framework-as-its-own-substrate axis

ADR-0057 enumerated 13 drift-class axes the framework should cover. The Run #5 meta-finding adds a 14th: **framework-as-its-own-substrate** — assertions about the framework itself (auto-attestation surfaces, drift-detect gate output, ADR Status fields, claim cross-check JSON) must be held to the same standard the framework asserts for the rest of the portfolio. The Decision items A.3 + A.4 + C.3 + C.4 are the structural mechanism for this axis: vitest-asserted reflexivity at PR time, CI-blocking on coherence drift, and a dedicated CSP gate that mirrors the doc-drift gate's pattern.

This axis is what doc 64 (run5 postmortem) names "framework-eats-its-own-output reflexivity gate". This ADR ships the substrate-side; the methodology-side is recorded in doc 64 as the v3 candidate.

## Consequences

### Positive

- `/api/attestation` no longer contradicts ADR-0011, ADR-0061, or the README. The endpoint's brand value (single-curl audit-survivability per ADR-0056) is restored. Reviewers who curl `/api/attestation` after this ratchet will see hybrid retrieval correctly listed under `scope.shippedFlagGated[]` with full closing-ADR + version + flag-name + default-off detail.
- The reflexivity test in `attestation-data.test.ts` makes M1-class drift fail at PR time, structurally — not by review vigilance. A future regression where a deferred entry's ADR closes (the most likely re-emergence path) cannot ship.
- The CSP gate makes Finding-C-class drift fail at PR time. Adding a directive to the live CSP without disclosing it in the README is now CI-blocked. Removing a directive without updating the README still relies on review (forward-only gate per § Decision C.3 caveat), but the more common direction (adding without disclosing) is structurally pinned.
- Methodology v3 has a concrete test case (this Run #5) for whether the new stages (2.5 reflexivity, 4.5 framework-eats-output, brand-reflexivity multiplier) catch what v2 caught + nothing spurious. The v2-vs-v3 evolution is now measurable on the next hiring-sim run.
- Brand consistency: the portfolio narrative ("structural enforcement of audit-survivability") now extends to the structural-enforcement infrastructure itself. This closes the brand-inverse evidence the meta-finding surfaced.

### Negative

- The reflexivity assertion in `attestation-data.test.ts` reads ADR markdown files at test time — this couples the test to ADR file format (`- Status: **<text>**` pattern). A future ADR-template change would break the assertion and require the test to be updated. Mitigated by the assertion's regex tolerating both `**bold**` and unbolded forms.
- The CSP gate's heuristic for "load-bearing" directives is hand-maintained (`LOAD_BEARING_DIRECTIVES` array). A new directive landing (e.g., a future `'wasm-unsafe-eval'` addition) requires updating both the gate AND the README, and the gate updates first to fail-closed. This is the desired behaviour but does add a small ratchet ceremony to CSP changes.
- ADR-0057's 13 axes become 14. The completeness narrative needs an update banner; recorded as a follow-up if the framework-meta material accumulates further.

### Brand impact

The Run #5 verdict was `hire` because Stage 3 surfaced 3 medium drift in the candidate's own foundation. Run #6 against this ratchet (= post-v0.5.18) is expected to clear `strong hire` per the same v2 methodology, OR — if methodology v3 is run instead — to clear `strong hire` with the Stage 2.5 + 4.5 + brand-reflexivity multiplier exercising specifically the surface this ADR closed.

The simulator's closing line ("This is a real senior-tier portfolio") was the actual signal under the verdict-rule clamp. This ADR closes the gap between "real senior-tier" and the verdict-rule's `strong hire`.

## Alternatives considered

- **Accept `hire` and ship to applications without ratcheting**. Defensible (`hire` is genuinely sufficient for senior screen scheduling) but leaves the brand-foundation drift in production for the next reviewer to surface. Net: shorter path to first interview, longer path to interview-survivable narrative when a deep reviewer surfaces the M1 contradiction without the simulator doing it for us. Rejected.
- **Validate methodology v3 first (run Run #6 with v3 stages before this ratchet)**. The decision-to-ratchet is independent of the methodology evolution; v3 stages can be validated against the post-ratchet v0.5.18 portfolio, and the closure work in this ADR is needed regardless of whether v3 stages are accepted. Rejected — sequence v3 validation after this ratchet, not before.
- **Close M1 + C without the meta-finding axis (Decision item D)**. This would address the symptoms but leave the framework-as-its-own-substrate axis unwritten in ADR-0057's enumeration. The next regression would re-emerge in a different surface (e.g., `_claims.json` self-contradicting, or `check-doc-drift.mjs` returning 0 on a portfolio with unmatched drift in CI output reports themselves). Rejected — the axis is the actual closure.

## Follow-up (next-available-NNNN candidates)

1. **Hiring-sim Run #6** against v0.5.18 with v2 methodology to confirm the verdict moves to `strong hire`. If v2 returns `strong hire`, the brand-foundation closure is validated; if not, surface what v2 still catches.
2. **Hiring-sim Run #7** against v0.5.18 with v3 methodology (Stages 2.5 + 4.5 + brand-reflexivity multiplier) to validate the methodology evolution on the post-closure portfolio. v3 should return `strong hire` AND surface zero new drift if the closure is structurally complete.
3. **Calibration recovery** (long-pending): once an alt-LLM provider migration ships per ADR-0067 § Decision item 3, the lift figure for hybrid retrieval lands and `scope.shippedFlagGated[]` "flagDefault" can flip to `on` for the hybrid entry. That is independent of this ADR but lives in the same `attestation-data.json` surface.

## Related

- [Run #5 simulator output](../../.claude/other-projects/craftstack/63_hiring_sim_run_5_2026-04-29.md) — verbatim Stage 1-6 evidence
- [Run #5 postmortem + v3 methodology candidate](../../.claude/other-projects/craftstack/64_hiring_sim_run5_postmortem_2026-04-29.md)
- [methodology v2 source](../../.claude/other-projects/craftstack/50_hiring_sim_run_4_methodology_v2.md)
- `apps/knowledge/src/app/api/attestation/attestation-data.test.ts` — the new reflexivity test cases
- `scripts/check-csp-coherence.mjs` — the new CSP gate
- `scripts/generate-attestation-data.mjs` — the build-time generator updated to remove hybrid from deferred + add shippedFlagGated
- `.github/workflows/ci.yml` — the `doc-drift-detect` job extended with the CSP gate step
