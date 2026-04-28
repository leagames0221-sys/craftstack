# ADR-0059: Drift-audit framework v1.0 — hybrid Scorecard adoption + freeze + future-ratchet rule

- Status: Accepted
- Date: 2026-04-28
- Tags: ci-enforcement, audit-survivability, framework, governance, freeze, openssf
- Companions: [ADR-0057](0057-drift-framework-completeness.md) (the 13-axis framework), [ADR-0058](0058-branch-protection-ci-enforcement.md) (foundation closure), [ADR-0046](0046-zero-cost-by-construction.md) (structural-not-aspirational stance)

<!-- no-claim-needed: meta-decision about framework lifecycle and governance; the structural changes shipped in this ADR (Scorecard workflow, ADR-add-without-claim PR block, cron stale enforcement) are individually claim-checked under ADR-0046 / ADR-0058 entries respectively, not under ADR-0059. The freeze + ratchet-rule decisions are policy, not code state. -->

## Context

By v0.5.9, the drift-audit framework had grown to **13 axes (10 structural + 3 honest-disclose) plus a foundation ruleset**. Sessions 261–265 shipped 8 minor releases that each closed a specific drift class. A pattern emerged in Session 265 that needed addressing as a meta-issue rather than as another axis:

**The audit-of-audit loop.** Each self-audit produced new findings, each finding produced a new ratchet, each ratchet introduced a new meta-gap. Concretely:

- v0.5.7 → Session 263 audit → v0.5.8 (axes 7 / 3 / 12 + 3 honest-disclose)
- v0.5.8 → Session 264 audit → v0.5.9 (foundation ruleset + axis 7 honest-disclose)
- v0.5.9 → Session 265 audit → v0.5.10 (this ADR + Scorecard + cron stale + ADR-add block)

If the loop continues unchecked, the next session would almost certainly find a new meta-gap (it always does — this is bias, not signal). The honest reading: **the framework is mature enough that further self-audit-driven growth has rapidly diminishing returns**, and continuing to ratchet on self-audit alone is a known cognitive failure mode (Goodhart's law on audit metrics, the "testing the tests" regress in safety engineering).

Two problems flow from this:

1. **Over-engineered framework** — at some point the audit framework competes with the product surface for attention. A hiring reviewer who probes axis 14 finds the candidate has spent more time auditing than shipping the deferred features named in [ADR-0039](0039-knowlex-mvp-scope.md) (hybrid retrieval, HyDE, faithfulness check, Auth.js on Knowlex).
2. **Industry duplication** — several axes already covered by self-built scripts (branch protection liveness, Action pinning, dependency freshness, security-policy presence, token permissions) are covered by the **OpenSSF Scorecard**, an industry-standard 18-check repo-hygiene scanner. Continuing to maintain custom equivalents is duplicate work and a weaker brand signal than naming the standard.

The v0.5.10 ship resolves both: (a) adopt OpenSSF Scorecard as the hygiene baseline, drop the equivalent self-built ratchets; (b) close the highest-impact future-drift gaps in the **non-Scorecard** axes (axes 6 + 7); (c) **freeze the framework at v1.0** and codify the future-ratchet trigger rule.

## Decision

### 1. Hybrid adoption — Scorecard for hygiene, custom for project-specific drift

OpenSSF Scorecard is wired in as `.github/workflows/scorecard.yml` running weekly + on push to main + on `branch_protection_rule` events. It publishes to (a) the GitHub Security tab (SARIF code-scanning alerts), (b) the public scorecard.dev registry. Coverage delegated to Scorecard:

| Concern                              | Was self-built / planned                                         | Now delegated to Scorecard       |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------- |
| Branch protection live-state         | `_claims.json` ADR-0058 marker entries + planned `--strict` mode | Branch-Protection check          |
| Pinned dependencies (GH Actions)     | future-work flagged in ADR-0058 § Negative                       | Pinned-Dependencies check        |
| Dependabot enforcement               | Dependabot already configured                                    | Dependency-Update-Tool check     |
| Token permissions (`contents: read`) | ci.yml / smoke.yml `permissions:` already declared               | Token-Permissions check          |
| SECURITY.md presence                 | already present (pre-v0.5.10)                                    | Security-Policy check            |
| License presence                     | MIT LICENSE                                                      | License check                    |
| Code review on `main`                | enforced by ADR-0058 ruleset                                     | Code-Review check                |
| Dangerous workflows                  | none currently                                                   | Dangerous-Workflows check        |
| SBOM                                 | sbom.yml in place                                                | (not directly; sbom job remains) |
| CII best practices                   | n/a                                                              | CII-Best-Practices check         |

What stays self-built (Scorecard does not address these):

- Axis 1 — doc numerics vs implementation (`check-doc-drift.mjs`)
- Axis 2 — runtime schema canary (`/api/health/schema` + smoke probe)
- Axis 3 — ADR-ID cross-reference (`check-adr-refs.mjs`)
- Axis 4 — forward-dated banner staleness (CHANGELOG-as-truth in doc-drift)
- Axis 6 — operational temporal / cron health (`cronHealthHint` + this ADR's cron-stale enforcement)
- Axis 7 — ADR-claim ↔ implementation (`check-adr-claims.mjs` + this ADR's PR-time block)
- Axis 12 — external artefact freshness (smoke HEAD probes — already shipped)
- Audit attestation (`/api/attestation`)

The split is principled: **Scorecard owns repo-hygiene and supply-chain class** (universal across projects), **custom owns project-specific drift class** (ADR claims, prose numerics, schema canary — class that has no industry library and is part of the project's audit-survivable engineering brand). The brand argument: "candidate adopts industry standard for what's standard, builds custom only for what's project-specific" is a stronger judgement signal than either alone.

### 2. Two structural closures of axes 6 and 7 future drift

**Axis 7 — ADR-add-without-claim PR-time block** (`scripts/check-adr-claims.mjs` extension):

When a PR adds a new `docs/adr/NNNN-*.md` file, the script asserts that **either** the same PR touches `docs/adr/_claims.json` **or** the new ADR contains a literal `<!-- no-claim-needed: <reason> -->` HTML comment. Without one of those, the PR fails. This closes the highest-probability axis-7 future-drift mode: a maintainer (or AI session) writes a new ADR but forgets to add a claim entry, silently shrinking coverage from "11/56 ≈ 20%" toward "11/N ≈ progressively lower" as ADRs accumulate. Architectural-intent ADRs (ADR-0001 monorepo, ADR-0002 Prisma, ADR-0017 release-order) use the opt-out marker explicitly stating they have no checkable claim; concrete-decision ADRs land with a claim.

**Axis 6 — cron stale enforcement** (`smoke.yml` step):

The 6-hourly smoke run now curls `/api/attestation`, reads `measurements.daysSinceLastGreenRun`, and fails the smoke job when that value exceeds 7 days. Threshold rationale: ADR-0049 § retry-contract is designed to absorb 1–2 nights of Neon cold-start flake; 7 consecutive nights is unambiguously broken (paraphrase fragility incidents like the q020/q022 class don't last that long because they're per-question, not per-cron). Until v0.5.10, `cronHealthHint` was passive disclosure — a reviewer who curled the endpoint would notice staleness, but no automated gate caught it. This step converts passive disclosure into an active guard.

### 3. Framework freeze at v1.0 + future-ratchet trigger rule

Effective v0.5.10 ship, the **drift-audit framework is frozen at v1.0**. The current 13 axes + foundation + Scorecard hygiene baseline = the canonical surface. **Future ratchet expansion requires one of three external triggers**:

1. **Real incident** — a measured failure where the absent axis would have caught it. Examples that would qualify: a doc-vs-code drift that ships to prod and a reviewer notices; an ADR claim that turns out to be false in the implementation; a cron failure mode the threshold-7-day-fail doesn't catch. The v0.5.0 → v0.5.2 schema-vs-prod incident that produced ADR-0051 is the canonical pattern.
2. **External reviewer feedback** — a hiring reviewer, contributor, or peer review names a specific gap with a specific failure mode. Self-audit-driven discovery does **not** qualify; the bias mode named in this ADR's Context section is the reason.
3. **Re-evaluation date** — the framework is re-audited on a date-bound cadence: **2026-Q3** (specifically 2026-09-30) is the next mandatory re-audit window. Honest-disclose threats T-07 / T-08 / T-09 carry their own re-evaluation dates per the threat-model edits in this ratchet.

What this rule **prevents**: the loop pattern "I audited the framework → I found a gap → I closed it → I introduced a new meta-gap → I audit again." The rule is the structural equivalent of safety engineering's "safety case re-evaluation cadence" (ISO 26262, DO-178C) and the SRE community's "incident-driven post-mortem culture, not introspection-driven."

### 4. Honest-disclose TTL on T-07 / T-08 / T-09

Until v0.5.9, T-07 / T-08 / T-09 were perpetual disclosures with no expiry. v0.5.10 attaches re-evaluation dates per disclosure (codified in `docs/security/threat-model.md`):

- **T-07** (mutation testing): v0.7.0 ship or 2026-Q3, whichever first
- **T-08** (decisions without ADR): v0.6.0 ship or 2026-06-30
- **T-09** (live quota): v0.7.0 ship or 2026-Q3

Without TTLs, an honest-disclose can become a permanent dodge. With TTLs, the discipline is "name the trade-off, mitigate where possible, and **commit to revisiting**."

## Consequences

### Positive

- **Closes the audit-of-audit loop with structure, not willpower** — the freeze + trigger-rule converts "stop auditing" from a discipline that depends on the maintainer's restraint to a policy that the next AI session (or human contributor) can read in this ADR and respect.
- **Industry standard adoption signals literacy** — Scorecard publishing to scorecard.dev gives the repo a public scorecard page reviewers can cite. "Used the OpenSSF Scorecard standard" is a stronger judgement signal than "built a parallel custom equivalent" for the hygiene class.
- **Custom framework now focused on what's truly differentiating** — axes 1, 2, 3, 4, 6, 7, 12 + attestation are the project-specific drift classes industry libraries don't address. The brand "audit-survivable engineering" is now structurally accurate: Scorecard for hygiene, custom for the drift classes Scorecard cannot reach.
- **Axes 6 + 7 future drift closed** — the two weak points named in the v0.5.10 calibration are now PR-blocking / smoke-blocking. Future maintenance burden on these axes drops to near-zero (ADR-add-without-claim is 0 ongoing cost; cron-stale is 0 ongoing cost; coverage growth happens organically as new ADRs land with claims).
- **Honest-disclose TTLs prevent perpetual dodge** — converting T-07/T-08/T-09 from "permanently disclosed" to "disclosed with revisit date" is the discipline ADR-0046 demands generalised to threat-model rows.

### Negative

- **Scorecard publishes a public score** — until the score stabilises (typically 1-2 cycles), the scorecard.dev page may show 7-9/10 with specific check failures called out (e.g. SAST not configured beyond CodeQL, fuzzing not present). This is honest-disclose by construction; it surfaces axes the project hasn't addressed. The trade-off is intentional but it's a brand-visible artefact a reviewer might cite.
- **The freeze is itself a claim** — declaring "framework v1.0 frozen, no further ratchet without external trigger" is a commitment that the next 1-2 sessions will be tested against. If the maintainer (or AI) ratchets again on self-audit-driven discovery without one of the three triggers, the freeze ADR is itself drifted. The v0.5.10 ship is the last self-audit-driven ratchet; the next one must be triggered externally.
- **`<!-- no-claim-needed: ... -->` is a string-match opt-out** — a maintainer could in principle abuse it ("no-claim-needed: lazy") to bypass the axis-7 PR block. Mitigation: the marker requires a reason after the colon, code review catches abuse. Not structurally bulletproof but raises the cost of the bypass meaningfully.
- **2026-Q3 re-evaluation date is calendar-bound, not workload-bound** — if v0.6.0 / v0.7.0 ship faster or slower than expected, the date stays. Acceptable; calendar-bound is the simplest discipline.

### Recursive integrity (the meta-meta question, second iteration)

ADR-0058 closed the recursive question of "does the foundation exist?" via a marker file. ADR-0059 closes the deeper recursive question of "is the framework still being actively audited or has it become a perpetual ratchet?". The freeze + trigger rule provides a structural answer: **further audits are externally triggered, by date or by incident**. Self-introspection does not count. A future reviewer probing "is this candidate still in the audit-of-audit loop?" finds the freeze declaration and the trigger rule. If a future ship violates the trigger rule (self-audit-driven ratchet despite no external trigger), the violation is itself an axis-7 candidate against ADR-0059's claims — meta-recursion bottoms out.

## Alternatives

- **Keep ratcheting (continue v0.5.10 → 0.5.11 → 0.6.0 self-audit cycle)**. Rejected because the audit-of-audit loop is the named failure mode this ADR addresses; continuing it would prove the failure mode rather than escape it.
- **Stop at v0.5.9, no v0.5.10**. Rejected because v0.5.9 left two known structurally-weak points (axes 6 + 7 future drift) and the marker-vs-live divergence was acknowledged in ADR-0058 § Recursive integrity as deferred. Closing them in v0.5.10 + freezing is more coherent than freezing with known gaps.
- **Adopt Scorecard alone, drop all custom**. Rejected because Scorecard does not address axes 1, 2, 3, 4, 6, 7, 12 + attestation — those are project-specific and have no industry library. The custom framework's value is in those non-overlapping axes, not in the hygiene-axis duplication this ADR removes.
- **Replace freeze with explicit "next audit Q3" plus regular cadence (every quarter)**. Rejected for v0.5.10 because the loop bias is recent and acute; a too-soon cadence re-opens the loop. 2026-Q3 (5 months out at v0.5.10 ship time) is far enough that the bias decays. If the cadence proves too slow, can be tightened in a future ratchet — but that ratchet must come from external trigger, not self-audit.

## Implementation status

Shipped in v0.5.10:

- `.github/workflows/scorecard.yml` (new) — OpenSSF Scorecard weekly + on push to main + on branch_protection_rule
- `SECURITY.md` (existing, footer updated with v0.5.10 review date)
- `scripts/check-adr-claims.mjs` (modified) — PR-time integrity block: new ADR must touch `_claims.json` or carry `no-claim-needed` marker
- `.github/workflows/smoke.yml` (modified) — cron stale > 7 days fails smoke
- `docs/security/threat-model.md` (modified) — T-07 / T-08 / T-09 each gain a Re-evaluation date
- This ADR
- `docs/adr/README.md` — index entry
- `CHANGELOG.md` — v0.5.10 entry
- README + portfolio-lp + page.tsx Stat block — ADR count 57 → 58
- `_claims.json` — no new entries (ADR-0059 is `no-claim-needed: meta-decision` per its frontmatter comment); existing entries unchanged

### Verification

```bash
# Scorecard active and publishing:
gh api repos/leagames0221-sys/craftstack/actions/workflows/scorecard.yml --jq '.state'
# → active

# Cron-stale gate present in smoke.yml:
grep -q "Cron health threshold" .github/workflows/smoke.yml && echo "ok"
# → ok

# ADR-add PR block: this very PR (which adds ADR-0058 + ADR-0059) is
# expected to pass because ADR-0059 carries the no-claim-needed marker
# and ADR-0058 already added two _claims.json entries in v0.5.9.
node scripts/check-adr-claims.mjs
# → 24/24 claim(s), 0 failure(s); PR-time integrity: pass

# Re-evaluation dates explicit in threat-model:
grep -c "Re-evaluation date" docs/security/threat-model.md
# → 3
```
