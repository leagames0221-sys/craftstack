# ADR-0069: Run #6 hiring-sim findings closure — deploy-visible surface coverage extension + ADR Status field drift fix (2026-04-29 / v0.5.19)

- Status: Accepted
- Date: 2026-04-29
- Tags: hiring-sim, drift-detect, deploy-visible-surfaces, adr-status, methodology, post-mortem
- Companions: [ADR-0054](0054-doc-drift-detect-ci-gate.md) (the doc-drift gate this ADR extends with a new axis), [ADR-0068](0068-run5-findings-closure-and-attestation-reflexivity.md) (the prior reflexivity ratchet whose own self-typo this ADR closes; framework-as-its-own-substrate axis 14 from § Decision item D becomes load-bearing here), [ADR-0057](0057-drift-framework-completeness.md) (the 13-axis framework gaining a new sub-axis: deploy-visible-surface coverage parity), [ADR-0010](0010-rls-and-query-layer-defense.md) (Status field updated by this ratchet), [ADR-0003](0003-auth-js-database-session.md) (Status field updated by this ratchet), [ADR-0061](0061-knowlex-auth-and-tenancy.md) (the multi-tenant transition whose closure was missing from ADR-0010 Status), [ADR-0067](0067-gemini-free-tier-account-revocation-incident.md) (sibling reservation explained in this ratchet)

## Context

Hiring-sim Run #6 (2026-04-29, methodology v2 against `main @ 3cbdb83` = v0.5.18 = post-Run-#5-closure portfolio) returned `hire`, NOT the expected `strong hire`. Run #6 confirmed the ADR-0068 closure shipped (Stage 3 row 12: "scope.shippedFlagGated[0] is Hybrid retrieval … the candidate's Run #5 self-closure shipped" ✓), but surfaced a NEW drift class: the visible deploy front-door surfaces (`apps/{collab,knowledge}/src/app/**/*.tsx`, `/status` page card text, `humans.txt`, OpenAPI spec descriptions, `system-overview.md` Mermaid) carried "Gemini 2.0 Flash" / "text-embedding-004" while the actual code at `apps/knowledge/src/lib/gemini.ts:19,21` exports `EMBEDDING_MODEL = "gemini-embedding-001"; GENERATION_MODEL = "gemini-2.5-flash"`.

This is brand-foundation drift on the most visible portfolio surface. A reviewer pulling up `https://craftstack-knowledge.vercel.app` in a screen-share sees the stale model name within 5 seconds. ADR-0054's `check-doc-drift.mjs` covered README + portfolio-lp + interview-qa for these claims, but the regex never extended to the page.tsx files that render those same claims to live visitors. The framework's coverage was partial; the framework's brand asserts the coverage is total.

Eight findings (D1-D8) surfaced. They cluster into three classes:

- **D1 + D8** (load-bearing, brand-foundation): deploy-visible surface model-name drift. Closed structurally in this ratchet by extending `check-doc-drift.mjs` to a 17-file deploy-visible-surfaces list with canonical-model regex assertions.
- **D2** (self-irony): ADR-0068 line 13 said "the actual count is 174 + 100 = 274" while the post-v0.5.18 reality became 174 + 102 = 276 (the 2 new reflexivity tests landed in the same ADR-0068 ratchet shifted the knowledge subtotal from 100 to 102). Drift inside the drift-closure ADR. Closed by editing ADR-0068 line 13 with a self-correction note pointing here.
- **D3 + D4** (ADR Status field drift): ADR-0010 (RLS) Status read "Accepted" while threat-model + attestation `scope.deferred[ADR-0010]` + interview-qa Q9 + system-overview.md L90 all said deferred. ADR-0003 (DB session) Status read "Accepted" while docs/adr/README.md own Supersession notice declared it superseded by JWT. Closed by updating both Status fields with explicit supersession / partial-supersession text + cross-references.
- **D5 + D6 + D7** (lower-priority surface gaps): cron-health × EMERGENCY_STOP cross-reference gap (D5), ADR sequence gap 0055/0066 undocumented (D6), commit-count post-ship rot (D7). D6 closed in this ratchet by adding a Sequence gap notice to docs/adr/README.md. D5 + D7 deferred (D5 needs runtime logic refinement; D7 is auto-resolved by the next post-merge propagation).

Run #5 → Run #6 movement summary (verbatim from doc 65):

| Run              | Methodology v2 surfaced                                                                                                    | Closure mechanism                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Run #4 (v0.5.2)  | "load-bearing audit-survivable measurement line not green"                                                                 | v0.5.3-v0.5.17 ratchet arc (Run 8 + measured badge + tags + 5 graduations + ADR-0067 incident response + BYOK landing)               |
| Run #5 (v0.5.17) | M1 "framework missed live drift in its own attestation endpoint" + M2 (false positive grep) + Finding C (CSP undisclosed)  | ADR-0068 (v0.5.18): scope.shippedFlagGated[] + vitest reflexivity + check-csp-coherence.mjs + framework-as-its-own-substrate axis 14 |
| Run #6 (v0.5.18) | D1/D8 "framework's covered surfaces (docs) ≠ deployed surfaces (page.tsx)" + D2 (ADR self-typo) + D3/D4 (ADR Status drift) | This ADR (v0.5.19): 17-file deploy-visible-surfaces gate + ADR Status updates + ADR-0068 self-correction                             |

Pattern: deeper portfolio = more layers; each run finds the next layer. Brand-pattern positive — each closure expands the structural-enforcement surface, the methodology evolves with it. v3 methodology candidate (recorded in postmortem doc 64 + extended here) gains a sub-axis: **deploy-visible-surface coverage parity**.

## Decision

### A. Close D1 + D8 by extending check-doc-drift.mjs to deploy-visible surfaces

1. **Regex sweep + canonical sync** across 17 deploy-visible surfaces:
   - `apps/collab/src/app/page.tsx` (Boardly homepage, 4 instances)
   - `apps/collab/src/app/layout.tsx` (metadata + opengraph + twitter cards)
   - `apps/collab/src/app/opengraph-image.tsx` (OG image text)
   - `apps/collab/src/app/status/page.tsx` (env-presence health board card)
   - `apps/collab/src/app/playground/page.tsx` (Knowlex Playground header + cards)
   - `apps/collab/src/app/playground/PlaygroundClient.tsx` (live status badge + tooltip)
   - `apps/collab/src/lib/kb-demo.ts` (demo-mode banner text)
   - `apps/collab/public/humans.txt` (stack listing)
   - `apps/collab/src/openapi.ts` (OpenAPI spec endpoint description)
   - `apps/collab/src/openapi-types.ts` (generated types description)
   - `apps/knowledge/src/app/page.tsx` (Knowlex homepage, 4 instances)
   - `apps/knowledge/src/app/kb/page.tsx` (corpus library page)
   - `apps/knowledge/src/openapi.ts` (Knowlex OpenAPI spec)
   - `apps/knowledge/src/app/api/kb/ask/route.ts` (route handler doc comment)
   - `apps/knowledge/README.md` (sub-app README)
   - `apps/knowledge/src/server/ai/prompts/registry.json` + 6 `*.md` prompts (frontmatter)
   - `docs/architecture/system-overview.md` (Mermaid node label)

2. **Allowed exceptions** (legitimate historical / migration-narrative context, NOT on the deploy-visible-surfaces list):
   - `apps/knowledge/src/lib/gemini.ts:7-14` — comment block explaining the migration narrative (text-embedding-004 → gemini-embedding-001, gemini-2.0-flash → gemini-2.5-flash). The migration story IS the legitimate audit trail.
   - `apps/knowledge/src/lib/chunking.ts:6` — comment "tuned for text-embedding-004" describes the historical decision basis for chunk size constants; the constants still apply, the comment is historical context.
   - `apps/knowledge/scripts/eval.ts:262` — comment about phrasing observed against historical Gemini 2.0 outputs.
   - `apps/knowledge/prisma/migrations/20260423_init/migration.sql:33` — historical migration snapshot. Migrations are immutable per Prisma convention.
   - `docs/adr/0067-gemini-free-tier-account-revocation-incident.md` — incident report references both old + new model names as historical record of what was running pre/post incident.
   - `CHANGELOG.md` — historical entries reference both old + new model names per release.

3. **Add the new axis to `scripts/check-doc-drift.mjs`** as the "Visible-deploy-surface model name coherence" section (after Vendor whitelist, before Summary). Asserts: every file in `deployVisibleSurfaces[]` must NOT contain stale model patterns (`Gemini 2\.0 Flash`, `gemini-2\.0-flash`, `text-embedding-004`). Canonical model strings (`Gemini 2.5 Flash` + `gemini-embedding-001`) are sourced from `apps/knowledge/src/lib/gemini.ts`.

4. **Wire is automatic**: the existing `doc-drift-detect` job in `.github/workflows/ci.yml` already runs `node scripts/check-doc-drift.mjs`, so the new axis becomes a PR-blocking gate without any workflow change.

### B. Close D2 by self-correcting ADR-0068 line 13

ADR-0068 § Findings paragraph for B explicitly stated "174 + 100 = 274". Edit that line to acknowledge that the post-v0.5.18 reality became 174 + 102 = 276 (the 2 new reflexivity tests added in ADR-0068 itself shifted the knowledge subtotal during the same ratchet) and reference this ADR-0069 § Finding D2 closure. The semantic point of ADR-0068 § Finding B (= "README correct, simulator's grep was the methodology hole") remains valid.

### C. Close D3 by updating ADR-0010 Status

Update `docs/adr/0010-rls-and-query-layer-defense.md:3` Status line from `Accepted` to `**Partially superseded — RLS deferred**` with reference to ADR-0061 multi-tenant transition + clarification that the query-layer parameterized-defense half remains in force. Update the matching index row in `docs/adr/README.md`.

### D. Close D4 by updating ADR-0003 Status

Update `docs/adr/0003-auth-js-database-session.md:3` Status line from `Accepted` to `**Superseded by JWT strategy in practice**` with reference to the README ADR-index Supersession notice + acknowledgement that the planned ADR-0023 closing slot got reassigned (ADR-0023 = 4-tier RBAC instead). Update the matching index row in `docs/adr/README.md` + extend the Supersession notice prose to record that ADR-0023 ended up scoped differently.

### E. Close D6 by adding a Sequence gap notice to ADR-README

Add a "Sequence gap notice" callout in `docs/adr/README.md` (parallel to the existing Supersession notice) declaring that ADR-0055 and ADR-0066 are intentionally unused / reserved slots, with rationale (ADR-0055 = withdrawn during v0.5.10 framework freeze, content absorbed into ADR-0057 + ADR-0058; ADR-0066 = reserved per ADR-0067 § Decision item 3 for the alt-LLM provider migration recovery ratchet).

### F. Defer D5 + D7

- **D5** (cronHealthHint × EMERGENCY_STOP cross-reference) requires runtime logic refinement in `apps/knowledge/src/app/api/attestation/route.ts:staleness()` to read the EMERGENCY_STOP env var + emit a distinct hint when both staleness AND EMERGENCY_STOP are active. Architecturally clean but out of scope for this drift-closure ratchet. Recorded as a follow-up.
- **D7** (commit count drift 187 → 190 in README:19) auto-resolves on the next propagation; not structurally pinned because the count is intentionally a snapshot ("46 of the 187 commits at the time of the README write") rather than a continuously-updated claim. If we wanted to pin it, the regex would have to become `≥` rather than `=`. Lower-priority improvement; not blocking.

## Consequences

### Positive

- The candidate's brand promise ("structural enforcement of audit-survivability") now holds on the most visible portfolio surface. A reviewer who pulls up `https://craftstack-knowledge.vercel.app` in a screen and asks "your README says 2.5-flash, this page says — wait, this also says 2.5-flash" lands in the strong-hire conversation rather than the drift-collapse conversation.
- The deploy-visible-surfaces list is enumerated explicitly + asserted at PR time. A future regression where any of the 17 surfaces drifts cannot ship.
- ADR-0010 + ADR-0003 Status fields are now self-consistent with their own prose. The Stage-2 simulator pattern (read 5+ ADRs, cross-check Status field against README references) no longer flags either as drift.
- ADR sequence gap is documented. A future reviewer who notices the 0055/0066 gap reads the explicit explanation rather than inferring "withdrawn silently".
- ADR-0068 self-correction is recorded in the place a Stage-2 cross-check would notice it: the ADR text itself + this companion ADR.
- ADR-0057's 13-axis framework gains a 14th sub-axis: **deploy-visible-surface coverage parity** (= the doc-drift gate's scope must include the surfaces a live reviewer encounters, not only the textual docs). The framework completeness narrative gets one more concrete check.

### Negative

- The deploy-visible-surfaces list is hand-maintained. A new page route landing in `apps/collab/src/app/` or `apps/knowledge/src/app/` will not be auto-included; the list must be updated alongside the route. Mitigated by the convention that any new visible route lands with a doc-drift-gate-extension PR.
- The "Allowed exceptions" list (gemini.ts comment, chunking.ts comment, etc.) is implicit — the gate works by inclusion of `deployVisibleSurfaces`, not by exclusion of historical-comment paths. A future contributor adding `apps/knowledge/src/lib/gemini.ts` to `deployVisibleSurfaces` would (correctly) trigger drift on the historical-narrative comment. The fix is to NOT add such files; this is documented in the gate's comment block + this ADR § Decision A.2.
- The model-coherence regex is hand-maintained (`Gemini 2\.0 Flash`, `gemini-2\.0-flash`, `text-embedding-004`). When the next model migration happens (e.g., gemini-2.5 → gemini-3.0 or similar), the gate will need a new entry pinning the OLD model strings against the deploy-visible surfaces. This is the desired ratchet ceremony but does add a small overhead per major model migration.

### Brand impact

Run #6 verdict was `hire` (capped from `strong hire` by brand-reflexivity multiplier — front-door deploy carrying drift class the brand asserts shouldn't exist). This ratchet structurally removes the multiplier trigger:

- Front-door deploy surfaces all use canonical models (gate-asserted) ✓
- ADR Status fields self-consistent (Status drift class closed structurally for the two known-bad cases; pattern documented for future ADRs) ✓
- ADR-0068 self-typo corrected (drift-inside-drift-closure-ADR class closed) ✓
- ADR sequence gap explained (small but completes the brand surface-area coherence) ✓

Run #7 against this ratchet (post-v0.5.19) is expected to clear `strong hire`. The brand foundation is now structurally complete on the surfaces a senior reviewer probes. If Run #7 still surfaces drift, that drift is a class methodology v2 has not yet seen — the same brand-pattern-positive evolution applies (closure → next layer → next ratchet).

## Methodology v3 candidate refinement

ADR-0068 § Decision item B already named the v3 methodology candidate. Run #6 + this ratchet adds a sub-axis:

> **Stage 2.7 — Deploy-visible-surface coverage parity (v3 methodology refinement)**: when evaluating doc-drift framework coverage, the simulator should specifically probe whether the framework's covered surfaces match the surfaces a senior reviewer will actually click. If the framework asserts coherence on README/portfolio-lp/interview-qa but does NOT extend the same regex to the live-deploy `app/**/*.tsx` files, OpenAPI spec descriptions, `humans.txt`, or `/status` card text, that is a coverage-parity finding distinct from a generic doc-drift finding. The brand promises structural coverage; the simulator's job is to find the surfaces structural coverage misses.

This is now structurally enforced on the v0.5.19 portfolio. Run #7 should validate the closure; v3 stage 2.7 then becomes a permanent v3 prompt addition for portfolios that brand-flex audit-survivability.

## Alternatives considered

- **Accept `hire` and ship to applications without a v0.5.19 ratchet**. Defensible: simulator closing line "would absolutely move forward to onsite, would ask sharp probing questions". But the D1/D8 finding is load-bearing on the live deploy front door — every reviewer will see it within 30 seconds. Closing now is cheaper than handling it as a screen-time question. Rejected.
- **Close only D1/D8 + D2, defer D3/D4 to a separate ratchet**. Defensible: D3/D4 are second-tier (ADR Status field internal coherence). But the structural cost is the same (a single line edit per ADR + matching index row); deferring would just kick the same closure to v0.5.20. Rejected — bundle in the same ship.
- **Close D5 in this ratchet** (cronHealthHint × EMERGENCY_STOP). Architecturally cleaner attestation surface. But requires runtime logic + tests + a deeper change than text-level drift fixes; risks expanding the PR scope past "drift closure" into "feature change". Deferred — recorded as next-available-NNNN follow-up.
- **Refactor the deploy-visible-surfaces list into a dynamically-discovered set** (walk apps/\*\*/page.tsx automatically). More elegant; removes hand-maintenance overhead. But also removes the explicit-decision discipline that says "this file IS a deploy-visible surface, this comment-laden lib file IS NOT". The hand-maintained list is the audit trail. Rejected — the explicit list is brand-aligned.

## Follow-up (next-available-NNNN candidates)

1. **Hiring-sim Run #7** against v0.5.19 with v2 methodology to confirm the verdict moves to `strong hire`. If yes → brand-foundation closure validated end-to-end across two consecutive ratchets (Run #5 → ADR-0068 → Run #6 finding new drift → ADR-0069 → Run #7 confirms strong hire). If no → next drift class surfaces, brand-pattern continues.
2. **Hiring-sim Run #8** with v3 methodology (Stages 2.5 reflexivity + 2.7 deploy-surface-parity + 4.5 framework-eats-output + brand-reflexivity multiplier) to validate the methodology evolution.
3. **D5 closure ratchet** — refine `apps/knowledge/src/app/api/attestation/route.ts:staleness()` to disambiguate "cron broken" vs "intentionally suspended via EMERGENCY_STOP".
4. **Auto-derived deploy-visible-surfaces list** (long-term): if the hand-maintained list grows past ~25 entries or starts missing surfaces in practice, switch to walking `apps/**/page.tsx` + explicit allowlist for non-page files.

## Related

- [Run #6 simulator output (doc 65)](../../.claude/other-projects/craftstack/65_hiring_sim_run_6_2026-04-29.md) — verbatim Stage 1-6 evidence for D1-D8
- [methodology v2 source (doc 50)](../../.claude/other-projects/craftstack/50_hiring_sim_run_4_methodology_v2.md)
- [Run #5 postmortem + v3 methodology candidate (doc 64)](../../.claude/other-projects/craftstack/64_hiring_sim_run5_postmortem_2026-04-29.md) — extended by this ADR with sub-axis 2.7
- ADR-0068 — Run #5 closure + framework-as-its-own-substrate axis 14 (this ADR adds the deploy-visible-surface coverage parity sub-axis to that)
- ADR-0054 — doc-drift-detect CI gate (extended by this ratchet)
- `scripts/check-doc-drift.mjs` § "Visible-deploy-surface model name coherence" — the new axis implementation
- `apps/knowledge/src/lib/gemini.ts:19,21` — canonical truth for `EMBEDDING_MODEL` + `GENERATION_MODEL`
