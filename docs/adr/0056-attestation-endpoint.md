# ADR-0056: Attestation endpoint — single-curl audit-survivability artefact

- Status: Accepted
- Date: 2026-04-28
- Tags: observability, audit-survivability, runtime, hiring-sim, ci-enforcement
- Companions: [ADR-0053](0053-runtime-schema-canary.md) (runtime schema canary), [ADR-0054](0054-doc-drift-detect-ci-gate.md) (PR-time prose drift gate), [ADR-0046](0046-zero-cost-by-construction.md) (audit-survivability stance)

## Context

By v0.5.5, the audit-survivability discipline is enforced at three layers:

| Layer                | Mechanism                                  | Catches                                                                  |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| PR-time              | doc-drift-detect (ADR-0054)                | embedded numerics + version banners + vendor whitelist in markdown / TSX |
| Boot-time            | `vercel-build` migration regime (ADR-0051) | schema-vs-prod drift on deploy                                           |
| Runtime — schema dim | `/api/health/schema` (ADR-0053)            | live db column drift, surfaced within 6h via smoke cron                  |

What the three layers **do not** address is the **reviewer's cross-check ergonomics**. A senior reviewer evaluating this portfolio (per the v2-methodology hiring sim Run #4 in `~/.claude/other-projects/craftstack/52_hiring_sim_run_4_2026-04-28.md` Stage 3) has to assemble:

- ADR count (`gh api .../docs/adr | length`)
- Latest tag (`git describe --tags --abbrev=0`)
- Live schema drift (`curl /api/health/schema`)
- Corpus stats (`curl /api/kb/stats`)
- Last eval run state (`gh api .../docs/eval/reports`)
- Status banner version in 4 docs (manual read)
- Honest scope notes from threat-model (manual read)
- Deferred features list from portfolio-lp (manual read)

Eight separate fetches. The cross-check is feasible (the reviewer's job is exactly this) but the **ergonomics asymmetry** — candidate over-claims everywhere, reviewer pieces together a verification by hand — is what `audit-survivable engineering` (the topic on the GitHub About sidebar) is supposed to flip.

There is also a structural trade-off, surfaced by Run 9 (ADR-0049 § 8th arc, 2026-04-28 04:00 UTC, 4/30 = 13.3% on a Gemini paraphrase fragility recurrence): the auto-commit-on-green-only policy means `docs/eval/badge.json` stays at the last green run's value, not the most recent cron's value. That is the _correct_ structural choice (regression reports must not pollute the README badge) but it leaves the badge invariant under cron failures. T-06 in `docs/security/threat-model.md` discloses this trade-off honestly; the disclosure needs a **complementary observable** so a reviewer can assess "last cron health" alongside "last green measurement."

## Decision

Ship `GET /api/attestation` (knowledge app) — a single endpoint that returns the full audit payload in one JSON response, derived from build-time invariants + runtime probes + per-request staleness computation.

### Build-time generation

`scripts/generate-attestation-data.mjs` runs in `postinstall` + `vercel-build` and writes `apps/knowledge/src/lib/attestation-data.json` with:

```jsonc
{
  "tag": "v0.5.5", // git describe --tags --abbrev=0
  "commit": "0ceaa604", // git rev-parse HEAD (8 chars)
  "buildAt": "2026-04-28T...", // ISO timestamp at generation
  "claims": {
    "adrCount": 54, // ls docs/adr/*.md | wc -l
    "boardlyRouteCount": 38, // tree walk of apps/collab/src/app
    "cspGrade": "A",
    "cspNote": "rolled back from A+ per ADR-0040 (...)",
  },
  "measurements": {
    "lastEvalRun": {
      // latest docs/eval/reports/YYYY-MM-DD.json
      "ranAt": "2026-04-27T19:38:54.015Z",
      "goldenVersion": 4,
      "passed": 24,
      "total": 30,
      "passRatePct": 80,
      "latencyP50Ms": 2311,
      "latencyP95Ms": 8221,
      "overallPass": true,
    },
  },
  "scope": {
    "deferred": [
      // hardcoded; updated when ADR Status changes
      {
        "feature": "Hybrid search (BM25 + vector via RRF)",
        "adr": "ADR-0011",
        "reason": "ADR-0039 MVP scope",
      },
      // ... 7 entries total
    ],
    "honestScopeNotes": [
      "T-01: Boardly Pusher channels are public; ...",
      "I-01: Knowlex is single-tenant per ADR-0039; ...",
      "T-06: README measured-eval badge stays at last-green-state, ...",
    ],
  },
}
```

The JSON is **gitignored** — never committed. `postinstall` regenerates on `pnpm install`, `vercel-build` regenerates on every Vercel deploy. Local TypeScript / lint resolve the file because the postinstall already ran.

### Runtime route

`apps/knowledge/src/app/api/attestation/route.ts` imports the build-time JSON, augments with per-request runtime probes:

- `runtime.schema.{drift, latestMigration, checks[]}` — same logic as `/api/health/schema`, embedded inline so the attestation endpoint is self-contained
- `runtime.corpus.{documents, chunks, embeddings, indexType, storedDim, expectedDim, embeddingModel}` — same logic as `/api/kb/stats`
- `measurements.daysSinceLastGreenRun` — `(Date.now() - lastEvalRun.ranAt) / day`, rounded to 2 decimals
- `measurements.cronHealthHint` — three-tier string: `fresh (<36h)` / `stale (36h-3d)` / `very stale (>3d)`
- `probedAt` — request timestamp

HTTP status: `200` when schema drift is false, `503` when drifted (mirrors `/api/health/schema`'s contract). `cache-control: no-store` so a CDN cannot serve a stale snapshot.

### Smoke probe

`apps/knowledge/tests/smoke/stats.spec.ts` adds a fourth probe: `GET /api/attestation` must return 200, has the load-bearing fields, and `cronHealthHint` is non-empty. The 6-hourly smoke cron asserts the endpoint stays well-shaped against the live deploy.

### Vitest unit test

`apps/knowledge/src/app/api/attestation/attestation-data.test.ts` (5 cases) validates that `attestation-data.json` is structurally well-formed: required fields exist, ADR count matches `ls docs/adr/`, `honestScopeNotes` covers T-01 / I-01 / T-06, `scope.deferred` is non-empty with each entry having `feature` + `adr` + `reason`. Catches the case where `postinstall` did not regenerate (stale JSON) before tests run.

### README + portfolio-lp visibility

The README `How to evaluate this in 10 minutes` section gains a new step 0:

> **0. Single-curl probe**: `curl https://craftstack-knowledge.vercel.app/api/attestation | jq` returns the full audit payload — tag, commit, buildAt, adrCount, lastEvalRun, schema drift state, corpus stats, days since last green eval run, the cron health hint, and the deferred features + honest scope notes. Replaces the 8-fetch reviewer cross-check with one URL.

## Consequences

### Positive

- **Reviewer ergonomics flipped**. The standard portfolio review pattern (`gh api` + `git log` + 4 markdown reads + 3 endpoint curls) collapses to a single `curl /api/attestation | jq` that returns the full audit. The candidate's effort to make the cross-check easy is itself a senior-level signal — exactly the discipline the [`audit-survivable-engineering`](https://github.com/leagames0221-sys/craftstack) topic on the About sidebar names.
- **Closes the T-06 trade-off honestly**. The README badge stays at last-green-state by design; this endpoint exposes `daysSinceLastGreenRun` + `cronHealthHint` as the complementary observable so a reviewer can see _both_ the last clean measurement _and_ the cron freshness. T-06 self-discloses the trade-off; this endpoint provides the live counter.
- **Pattern C live derivation, paired with Pattern A** (doc-drift-detect, ADR-0054). The script asserts at PR-time, the endpoint exposes at runtime; they are dual surfaces of the same audit-survivability claim. Both can run in CI for synthetic regression — the script in `doc-drift-detect`, the endpoint in `live smoke`.
- **No new secret surface area**. The endpoint reads only `information_schema` + `_prisma_migrations` + the build-time-baked JSON. Nothing in the response is sensitive (column names are public via `prisma/schema.prisma`, ADR titles are public, eval pass-rates are public per ADR-0049's Tier C-#2 auto-commit). If a future schema introduces sensitive table names, gate the endpoint behind `ENABLE_OBSERVABILITY_API=1` per the same pattern as `/api/kb/budget`.
- **Composability with future drift classes**. New invariants worth surfacing (e.g., feature flags state, secret rotation timestamps, per-cron pass rate trend) become a new field in `generate-attestation-data.mjs` + an assertion in `attestation-data.test.ts`. Linear maintenance.
- **Run 9 incident gets a structural mitigation, not a prompt-tuning Goodhart**. ADR-0049 § 8th arc names the paraphrase fragility recurrence; the right response is observation + LLM-as-judge follow-up, not regex tweaking. This endpoint surfaces "the badge says 80% but the last cron was N days ago and red" as a single field, so a reviewer who cares about that dimension can see it without trusting the badge alone.

### Negative

- **Build-time generation adds a step**. `pnpm install` now runs `prisma generate && node scripts/generate-attestation-data.mjs` in postinstall (~200ms extra). `vercel-build` adds the same step (~200ms). Negligible operationally; surfaces as one more scripts-section line.
- **Gitignored JSON file is invisible on GitHub code review**. A reviewer browsing the repo sees `import attestationData from "@/lib/attestation-data.json"` referring to a file not in the tree. The route's docstring + this ADR explain that the file is build-time-generated. The trade-off (avoid drift via gitignore vs visible-by-default file in tree) favours drift-free; commenting in the route handler covers the "where does this file come from" question.
- **`scope.deferred` + `honestScopeNotes` are hardcoded** in the generation script. Updating these requires editing the script, the same maintenance cost as updating the deferred list in portfolio-lp / interview-qa. Future improvement: derive from the threat-model + ADR Status fields (parser). Deferred until the lists grow past ~10 entries.
- **`measurements.cronHealthHint` thresholds are hardcoded** (1.5d / 3d). A new release schedule (weekly cron instead of nightly) would need the thresholds re-tuned. Tracked as a follow-up if the eval cadence ever changes.

## Alternatives

- **Multiple separate endpoints** (`/api/_meta/tag`, `/api/_meta/eval`, `/api/_meta/scope`, ...). Rejected: more URLs to remember, no aggregate snapshot for a reviewer. The whole point is a single curl returns the full payload.
- **Pre-render the attestation as a static `/attestation.json` at build time** (no runtime augmentation). Rejected: schema drift + corpus stats + days-since-last-green-run are runtime-derived, and pre-rendering them would lock the snapshot to build time, missing the live db state. The hybrid (build-time invariants + runtime augmentation) is the right shape.
- **Use a shared library file imported by both `/api/health/schema` and `/api/attestation`** instead of duplicating the schema probe logic. Rejected for v0.5.6 ship simplicity — the duplication is ~30 lines, the import coupling would mean the two endpoints break together, and `expected.test.ts` (ADR-0053) already enforces consistency between the two `EXPECTED_SCHEMA` constants. If a third endpoint also needs schema introspection, that would tip the trade-off to "extract a shared lib."
- **GraphQL endpoint** for the audit payload. Rejected: the payload is fixed-shape and ~5KB; REST + JSON is the right tool. GraphQL would add a query layer for a single use case.
- **Skip the endpoint, ship a Markdown summary instead** (`docs/audit-summary.md` regenerated by the same script). Rejected: a static markdown can't surface live db state or staleness; the endpoint is the right shape because the _runtime_ dimensions (drift, days-since-last-green) are the load-bearing signals.

## Implementation status

Shipped in v0.5.6:

- `scripts/generate-attestation-data.mjs` (new) — build-time generator, ~200ms
- `apps/knowledge/src/app/api/attestation/route.ts` (new) — runtime endpoint, force-dynamic, no-store
- `apps/knowledge/src/app/api/attestation/attestation-data.test.ts` (new) — 5 Vitest cases
- `apps/knowledge/tests/smoke/stats.spec.ts` — 4th Playwright probe (live deploy assertion)
- `apps/knowledge/package.json` — `postinstall`, `build`, `vercel-build` all run the generator
- `.gitignore` — `apps/knowledge/src/lib/attestation-data.json` excluded
- `docs/security/threat-model.md` T-06 — references this ADR as the mitigation
- `docs/adr/0049-rag-eval-client-retry-contract.md` § 8th arc — references this ADR for cron-health observability
- `docs/adr/README.md` — index entry
- `docs/hiring/portfolio-lp.md` + `README.md` — `Attestation` link added
- `CHANGELOG.md` — v0.5.6 entry
- ADR count 54 → 55 across all surfaces (the doc-drift-detect script catches this transition; it's the script's second self-test)

The reviewer cross-check is now a single URL.
