# ADR-0053: Runtime schema canary — closing the runtime side of ADR-0051

- Status: Accepted
- Date: 2026-04-28
- Tags: knowlex, prisma, ops, observability, ci-enforcement, audit-survivability
- Companion to: [ADR-0051](0051-prisma-migrate-on-vercel-build.md) (PR-time gate); together they form expand-contract-safe schema operations.

## Context

ADR-0051 ships a PR-time `pg_catalog` assertion (the `knowlex integration` job in `ci.yml`) that fails any merge introducing a `schema.prisma` change without a matching migration file. That gate prevents _future_ drift from landing on `main`.

What the gate cannot detect is the case the v0.5.2 incident actually exhibited: a deploy already on `main` that **lags the migrations on the live db**. Concretely, between 2026-04-26 07:50 UTC (v0.5.0 ship) and 2026-04-27 ~17:38 UTC (PR #32 redeploy that finally ran `vercel-build`), Vercel held the v0.5.0 build of the Knowlex deploy. The live db had `Document.workspaceId` only _after_ the redeploy fired `prisma migrate deploy` for the first time. ADR-0051 was already "shipped" by the time the eval cron's Run 7 (2026-04-27 06:35 UTC) crashed on the missing column — the structural ratchet was correct on paper but the runtime had not picked it up yet.

Confirming the same gap from the hiring-sim Run #4 v2 cross-check (`~/.claude/other-projects/craftstack/52_hiring_sim_run_4_2026-04-28.md` Stage 3): the smoking gun was _exactly_ this — a polished portfolio-lp / interview-qa / runbook claim that "drift-detect-v2 closes the v0.5.0 → v0.5.2 incident class," verified against the ADR Status field, but cross-checked against the live eval log which still showed the incident class active. The PR-time half held; the runtime half was vacuous.

## Decision

Ship a runtime canary that compares the live db's `information_schema.columns` against the columns that `prisma/schema.prisma` declares. Wire it as both an HTTP endpoint (for live probes + smoke assertion) and a Vitest unit test (for PR-time consistency between the canary's expected list and `schema.prisma`).

### `GET /api/health/schema`

`apps/knowledge/src/app/api/health/schema/route.ts`. Returns:

```jsonc
{
  "drift": false,
  "latestMigration": {
    "name": "20260426_workspace_tenancy",
    "appliedAt": "2026-04-27T17:38:42.123Z",
  },
  "checks": [
    {
      "table": "Document",
      "expected": [
        "id",
        "workspaceId",
        "title",
        "content",
        "charCount",
        "createdAt",
        "updatedAt",
      ],
      "actual": [
        "id",
        "workspaceId",
        "title",
        "content",
        "charCount",
        "createdAt",
        "updatedAt",
      ],
      "missing": [],
      "extra": [],
      "drift": false,
    },
    // ... one entry per declared model
  ],
}
```

HTTP status: `200` when `drift === false`, `503` when any model is missing a column. `extra` columns are non-fatal — they are normal during the expand phase of expand-backfill-contract. `latestMigration` is best-effort metadata so a triaging operator can see which migration the live db actually has, without ssh-ing to a Vercel runtime.

### `EXPECTED` constant ↔ `schema.prisma` consistency test

`apps/knowledge/src/app/api/health/schema/expected.test.ts` parses `schema.prisma`, extracts the scalar + `Unsupported(...)` fields per model, and asserts the `EXPECTED` constant in `route.ts` matches verbatim. It also catches the reverse case (a new model added to `schema.prisma` without registration in `EXPECTED`). A schema change that doesn't update both sides fails CI **before** it reaches main, so the canary cannot drift from its source of truth.

### `smoke.yml` assertion

`apps/knowledge/tests/smoke/stats.spec.ts` gains a third probe: `GET /api/health/schema` must return `status: 200` and `body.drift === false`, with a per-table assertion that `check.missing === []` for every declared model. The 6-hourly smoke cron surfaces drift within hours, not waiting for the nightly eval cron.

## Consequences

### Positive

- **Closes the runtime side of ADR-0051**. The exact incident the v0.5.2 cleanup arc retroactively documented (`Document.workspaceId does not exist`) would have been observable via this endpoint at v0.5.0 ship time + 90s, instead of taking ~23 hours to surface through the eval cron's ingest path.
- **Three-layer defence**: PR-time `pg_catalog` assertion (ADR-0051) + boot-time `vercel-build` migration (ADR-0051) + runtime canary on the live db (this ADR). Each layer fires at a different latency: PR-time = pre-merge, boot-time = pre-traffic, runtime = at most 6h after a drift appears. The same guarantee is checked at three orthogonal points; no single failure mode silences all three.
- **Operator artifact**: `latestMigration` in the response makes a "which migration does the live db actually have?" question a single curl, not a Neon dashboard hunt.
- **Endpoint is cheap**: two `information_schema` SELECTs + one `_prisma_migrations` SELECT, all on system catalogs. Adds a few ms to the smoke cron and is opt-in (`force-dynamic`, never cached).
- **Audit-survivable**: the canary's claim is verifiable by anyone with a curl — no internal tooling, no auth required. Matches the [ADR-0046](0046-zero-cost-by-construction.md) discipline of "guarantee is structural, not aspirational."

### Negative

- **`EXPECTED` is hardcoded**, not generated. The `expected.test.ts` Vitest test is the structural defence against the maintenance burden — any schema change that doesn't update `EXPECTED` fails CI immediately. Future improvement: code-generate `EXPECTED` from a Prisma generator hook, eliminating the constant entirely. Deferred because the parser-and-assert pattern is simpler to audit than a generator and the schema has 4 models, not 40.
- **Endpoint surfaces the exact column list to anyone who curls it**. Column names are not secrets (they are visible in `apps/knowledge/prisma/schema.prisma` on a public repo), but a future schema with sensitive table names should weigh whether to gate this endpoint behind `ENABLE_OBSERVABILITY_API=1` like `/api/kb/budget` already is. Today's tables (`Workspace`, `Document`, `Chunk`, `Embedding`) are not sensitive.
- **Doesn't catch column-type drift, only column-presence drift**. A column that exists but with the wrong type (e.g. `INT` instead of `BIGINT`) passes this canary. Type-level drift would require comparing `data_type` from `information_schema` against the Prisma DMMF, which adds maintenance complexity for an incident class that has not (yet) occurred. Tracked as a follow-up.

## Alternatives

- **Use Prisma's `dmmf.datamodel` at runtime** instead of a hardcoded `EXPECTED` constant. Removes the maintenance burden but couples the route handler to Prisma's runtime API surface, which has changed across major versions and requires Prisma client regeneration to update. The hardcoded constant + parsing test is simpler to reason about + the test catches divergence at PR time.
- **Run `prisma migrate diff --exit-code` on every request**. Reuses Prisma's official drift detection logic. Rejected for two reasons: (1) `prisma migrate diff` requires the Prisma CLI binary at runtime, which Vercel's serverless functions don't include by default and would inflate cold-start latency; (2) it is a _diff_, not a per-table breakdown, so it's harder to surface "Document is missing workspaceId" as the operator-facing signal.
- **Defer the canary to the eval cron's ingest probe** (which is what surfaces the drift today). Rejected because the eval cron is nightly (12-18h latency) and the smoke cron (6h) is the right cadence for schema drift; users hit broken routes before the nightly run can catch them. The eval cron's ingest probe stays as the second-layer canary; this endpoint is the first.
- **Wire the canary into `/api/kb/stats`** so an existing endpoint covers it. Rejected because `/api/kb/stats` is shaped around corpus health (counts, dim, index type) and overloading it would muddy both contracts. A dedicated `/api/health/schema` endpoint is what an operator triaging the runbook §1 case wants to curl.

## Implementation status

Shipped in v0.5.4:

- `apps/knowledge/src/app/api/health/schema/route.ts` — endpoint
- `apps/knowledge/src/app/api/health/schema/expected.test.ts` — Vitest consistency check (5 cases)
- `apps/knowledge/tests/smoke/stats.spec.ts` — Playwright smoke assertion against the live deploy
- `docs/security/threat-model.md` T-05 — schema-vs-runtime drift threat row, mitigated by this canary
- `docs/ops/runbook.md` §1 — Neon Postgres down section gains a callout pointing at this endpoint as the first-curl drift triage step
- This ADR

The smoking-gun condition (`Document.workspaceId does not exist`) is now structurally observable within 6h instead of taking a nightly cron + ~23h to surface.
