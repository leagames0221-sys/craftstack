# Repository ruleset — `main` branch protection

This file is the **offline-auditable marker** for the GitHub repository ruleset
configured per [ADR-0058](../docs/adr/0058-branch-protection-ci-enforcement.md).
Its existence is asserted by `scripts/check-adr-claims.mjs` against
`docs/adr/_claims.json` (axis 7 of the ADR-0057 drift-audit framework), which
makes the framework recursively defend its own foundation.

## Live policy (canonical source: GitHub API)

```bash
gh api repos/leagames0221-sys/craftstack/rulesets
gh api repos/leagames0221-sys/craftstack/rulesets/15652440
```

## Declared configuration (mirrored here for offline audit)

- **Ruleset name**: `main-branch-protection`
- **Ruleset id**: `15652440`
- **Target**: branch (default branch — `main`)
- **Enforcement**: `active`
- **Bypass actors**: `[]` (admins included; no exceptions)

### Rules

| Rule                     | Setting                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `pull_request`           | `required_approving_review_count: 0` (PR required, no reviewer needed) |
| `required_status_checks` | `strict_required_status_checks_policy: true`                           |
| `non_fast_forward`       | enabled (force-push to `main` blocked)                                 |
| `deletion`               | enabled (`main` cannot be deleted)                                     |

### Required status checks (PR-time)

1. `free-tier compliance`
2. `lint / typecheck / test / build`
3. `doc drift detect`
4. `knowlex integration (pgvector)`
5. `knowlex a11y gate (WCAG 2.1 AA)`
6. `Analyze (javascript-typescript)`
7. `authed Playwright`

These match exactly the check-run names emitted by the workflows in
`.github/workflows/` that have `pull_request:` triggers (ci.yml,
codeql.yml, e2e.yml). `boardly live smoke`, `knowlex live smoke`, and
`sbom` run on `push:` / `schedule:` only and would deadlock PR merges
if listed; they are intentionally excluded.

## Why this file matters

Per ADR-0058 § Recursive integrity, the ruleset's own existence has to be
asserted by axis 7 to avoid a "framework with a self-deleting foundation"
failure mode. `_claims.json` has an entry of `match: "exists"` against
this file path; deleting the ruleset without also deleting this file
leaves the framework in an inconsistent state that a future audit can
detect by cross-checking the GitHub API against this file's existence.

## Drift detection

If a future operator (or AI session) modifies the ruleset out-of-band,
the divergence between the live API and this file becomes a manual
review item during release prep. A future ratchet (v0.7.0+ candidate)
could automate the diff via `gh api ... | diff` against this file's
declared configuration; today the discipline is convention + this
marker.
