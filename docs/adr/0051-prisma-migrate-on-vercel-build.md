# ADR-0051: `prisma migrate deploy` in Vercel build script — closing the v0.5.0 schema-vs-prod drift

- Status: Accepted
- Date: 2026-04-27
- Tags: knowlex, prisma, vercel, ops, migration, ci-enforcement
- Supersedes (on the build pipeline dimension): the implicit "Prisma client generation is sufficient at build time" stance of [ADR-0042](0042-knowlex-test-observability-stack.md) § Build pipeline (which only ran `prisma generate`).

## Context

The v0.5.0 ship (2026-04-26 07:50 UTC) added the
`apps/knowledge/prisma/migrations/20260426_workspace_tenancy/migration.sql`
file (Workspace table + `Document.workspaceId NOT NULL` + FK + composite
index) and updated `schema.prisma` to match. The Prisma client was
regenerated per the existing `apps/knowledge/package.json` `build`
script (`prisma generate && next build`) and the v0.5.0 deploy went
green on every CI workflow.

What the deploy did **not** do: run `prisma migrate deploy` against the
Neon prod database. Vercel's build step never invoked it because the
`build` script never asked for it. The result was a **silent schema
drift** between the regenerated client (which expects the new
`workspaceId` column) and the live DB (which has neither the
`Workspace` table nor the new column).

The drift was invisible to the existing operational probes:

- `/api/kb/stats` — counts only, never references `workspaceId`. Returned `200` with `documents:10, chunks:20, indexType:hnsw` after v0.5.0.
- `/api/kb/documents` (GET / DELETE) — the v0.5.0 implementation also never references `workspaceId`. Returned `200` with the existing 10 docs.
- Live smoke (`smoke.yml` 6h cron) — exercised the same probes plus the public landing route. All green.
- Sunday 2026-04-26 audit (`~/.claude/other-projects/craftstack/45_full_audit_prompt_2026-04-26.md`) § 軸 4 concluded "schema migration prod 適用 = 異常なし" by inferring from those same probe responses.

The drift surfaced **23 hours later** when the eval cron's first ingest
of Run 7 (2026-04-27 06:35 UTC) crashed:

```
[eval] crashed: Error: ingest of "Knowlex RAG architecture" failed: 500
{"code":"Invalid `prisma.document.deleteMany()` invocation:
The column `Document.workspaceId` does not exist in the current database."}
```

`/api/kb/ingest` is the first route that **writes** through Prisma — it
exercises the title-based UPSERT (ADR-0050) which deletes by
`(workspaceId, title)`. The retrieval path (`/api/kb/ask` →
`retrieveTopK`) also pre-filters by `workspaceId` and would have failed
the moment any user issued a question; it never did between v0.5.0 ship
and Run 7 because the live URL has no organic ingest traffic.

The Sunday audit's axis-4 inference was a category mistake: probe
responses that don't touch the new column cannot disprove drift on that
column. The fix is twofold — close the drift now, and remove the
ambient possibility of future drift by running `prisma migrate deploy`
on every build.

## Decision

`apps/knowledge/package.json` gains a **`vercel-build`** script
alongside the existing `build`. Vercel detects `vercel-build`
automatically and prefers it over `build` when both exist; CI continues
to invoke `build`. The two scripts:

- **`build`** = `prisma generate && next build` — unchanged from
  v0.5.1. CI-safe, requires no DB credentials, used by GitHub Actions
  `lint / typecheck / test / build` job and by local dev.
- **`vercel-build`** = `prisma generate && prisma migrate deploy && next
build` — runs only on Vercel deploys. Applies pending migrations
  to the live DB before producing the production bundle.

This split is the canonical pattern from Prisma's
[Deploy to Vercel guide](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel).
A unified `build` that calls `prisma migrate deploy` would break CI
because the GHA build job has no DB credentials (and shouldn't — its
purpose is to verify the bundle compiles, not to mutate prod state).

Two structural consequences in addition to the script split:

1. **`prisma` CLI moves from `devDependencies` to `dependencies`**.
   Vercel prunes devDependencies during build per the same Prisma
   guide, so leaving the CLI in devDeps would surface as
   `prisma: command not found` at the migration step. The CLI
   tarball is bounded (a few MB) and only loaded at build time, so
   the bundle-size cost is zero at runtime.
2. **`DATABASE_URL` must be available to the Vercel build environment
   AND `turbo.json` must declare it in `passThroughEnv`** so Turborepo
   forwards it to the `vercel-build` script. Initially missed in this
   ADR's first push; observed when `prisma migrate deploy` errored
   with `datasource.url required` despite Vercel having the env set.
   The full passthrough list also covers `DIRECT_DATABASE_URL`,
   `GEMINI_API_KEY`, `SENTRY_AUTH_TOKEN`, `TENANCY_ENABLED`,
   `ENABLE_OBSERVABILITY_API`, `EMERGENCY_STOP`. Knowlex uses
   `@prisma/adapter-pg` (driver-adapter pattern, not the data proxy)
   and Neon's pooled URL accepts both runtime queries and migrations
   via the same connection string. If a future migration needs to
   acquire an exclusive lock that pgbouncer can't proxy, the
   `DIRECT_URL` split (Neon's recommended pattern) becomes the next
   ratchet.

### Idempotency and re-deploy safety

`prisma migrate deploy` is documented as safe to re-run: it consults
the `_prisma_migrations` table and only applies migrations whose
checksum doesn't already appear there. A second Vercel deploy on the
same commit (e.g. preview redeploy) is a no-op at the migration layer
and adds ~200ms to the build.

### Concurrent-deploy race

Prisma's docs do not address two parallel Vercel deploys racing on the
same DB. In practice this would happen only when a preview deploy
fires in parallel with a production push. Mitigation:

- Production and preview environments **do not share a database**
  (Vercel project env config). Production points at the Neon main
  branch; preview deploys (when introduced — see § Not in scope) will
  point at Neon preview branches per the Neon-Vercel integration
  pattern.
- Within the production environment, Vercel queues deploys per
  project — a second push on `main` waits for the first to finish.
  Prisma's `_prisma_migrations` row-level lock would also serialise
  any concurrent runs that did slip through.

### Failure mode: migration error during deploy

If `prisma migrate deploy` errors mid-build (e.g. a constraint
violation against existing rows), the build fails and Vercel keeps the
previous deployment live. The runtime stays on the old code+old
schema, which is the desired "atomic ship" property. The corrective
action is to fix the migration locally, push a new commit, and let
Vercel re-deploy.

This is **strictly safer** than the prior state where a build could
ship a new client against an old schema and only fail at first request.

## Consequences

**What changes immediately**

- The next push to `main` causes Vercel to run
  `prisma generate && prisma migrate deploy && next build`. The
  `20260426_workspace_tenancy` migration applies to prod Neon. The
  `Workspace` table is created, `Document.workspaceId` column is
  added with the default-workspace backfill, and `/api/kb/ingest` and
  `/api/kb/ask` resume working.
- `prisma` is in `dependencies` so Vercel keeps it available at
  build time.
- All five existing migrations (`20260423_init`,
  `20260424_hnsw`, `20260426_workspace_tenancy`, plus any future
  additions) are now part of the deploy contract.

**What changes for ops**

- Operators can no longer accidentally ship a Prisma schema change
  without the corresponding migration: the build will fail loudly if
  client expectations diverge from migrations applied.
- Migration files are now part of the deploy artifact in a
  load-bearing way. Editing or deleting a previously-applied
  migration file becomes a breaking change (Prisma's checksum
  comparison fails). The
  `apps/knowledge/prisma/migrations/migration_lock.toml` file already
  records the provider; this ADR makes the operational expectation
  explicit.

**What this exposes that the Sunday audit missed**

The Sunday audit (doc 45) concluded `軸 4: schema migration prod 適用 = 異常なし` by inferring from `/api/kb/stats` and `/api/kb/documents` returning `200`. Those endpoints don't reference `workspaceId`, so their responses were **not evidence** of migration application — they would have returned `200` either way. This ADR records that inference error explicitly so the next audit avoids the same trap:

> When auditing schema-migration application, probe the **specific column or constraint** introduced. Cheap proxy: a one-row test ingest against the new column from a workspace that did NOT exist pre-migration; or a `\d "Document"` via the Neon dashboard. Inferring from unrelated 200s is a category mistake.

**What this does NOT solve**

- **Vercel preview deploys against the production DB**: not yet
  configured. When preview deploys land, they should target a Neon
  branch (separate physical DB), not the prod DB.
- **CI assert that the local schema and migrations are coherent**:
  `prisma migrate diff` could be added to `ci.yml` to fail the PR
  when a schema change is committed without the corresponding
  migration. Tracked separately as a v0.5.3 follow-up.
- **Migration rollback playbook**: if a future migration is
  accidentally applied and needs to be reverted, the recovery path
  is "write a new forward migration that undoes it", not "edit the
  applied migration's content". A runbook entry covering this is
  Tier B follow-up.

## Related

- [ADR-0042](0042-knowlex-test-observability-stack.md) — established the original `prisma generate && next build` build pipeline; this ADR extends it.
- [ADR-0047](0047-knowlex-workspace-tenancy-plan.md) — the v0.5.0 schema partitioning whose migration was the first to surface this gap.
- [ADR-0046](0046-zero-cost-by-construction.md) — the cost-safety regime; a free-tier deploy still has an ops contract.
- Prisma docs — [Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel) and [Deploy database changes with Prisma Migrate](https://www.prisma.io/docs/guides/deployment/deploy-database-changes-with-prisma-migrate).

## Not in scope

- Preview-deploy DB strategy (Neon branch per preview).
- CI step adding `prisma migrate diff` for drift detection at PR time.
- A formal rollback runbook with worked examples.
- Switching to `DIRECT_URL` (Neon's pooled vs direct split) — only needed once a migration requires an exclusive lock pgbouncer can't proxy.
