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

**What this does NOT solve (revised after PR-time observations)**

- **Vercel preview deploys against the production DB — CONFIRMED LIVE**.
  Post-PR-#27 verification probe (2026-04-27 07:58 UTC) hit
  `https://craftstack-knowledge.vercel.app/api/kb/ingest` with body
  `{"title":"v052_verify_attempt2","content":"…"}` and received
  `HTTP 201` with `{"workspaceId":"wks_default_v050"}` — meaning the
  Vercel **preview build** for PR #27 (commit `f5cdc22`) ran
  `prisma migrate deploy` against the **production Neon DB**, not a
  preview-scoped branch. This is the Vercel default when env vars
  are scoped to all environments (Production + Preview + Development),
  which is the CLI/dashboard default for `vercel env add`. Implication:
  any preview build that succeeds has already mutated prod schema.
  This is operationally surprising and demands the Preview DB
  separation tracked below as a Tier C critical follow-up. **Today
  the preview-touches-prod behaviour was useful** (it pre-applied
  the v0.5.0 backfill before PR merge so live ingest recovered ~20
  minutes earlier than the merge would have done it), but in general
  it means a draft PR could schema-mutate prod via a preview build,
  which violates the principle that preview is supposed to be
  reviewable-without-side-effect. **Mitigation in this PR**: an
  operator note added to ADR-0047 § Status; immediate follow-up to
  wire the Vercel-Neon integration so preview deploys auto-create
  Neon branches, tracked as a v0.5.3 critical PR.
- **Migration rollback playbook**: if a future migration is
  accidentally applied and needs to be reverted, the recovery path
  is "write a new forward migration that undoes it", not "edit the
  applied migration's content". A runbook entry covering this is
  Tier B follow-up. This ADR's § Failure mode covers the
  build-fails-after-migrate case but not the
  migration-was-wrong-after-apply case.

**Drift detection — attempted, deferred to v0.5.3 (honest report)**

The v0.5.2 perfectionist scope attempted a `Verify schema matches
migrations (drift detect)` CI step using `prisma migrate diff
--from-migrations --to-schema --exit-code` against a `knowlex_shadow`
DB on the same pgvector service container. Two CI iterations
(commits `55e31e6` and `54eca07`) shipped against PR #27 with the
fix progressively narrowed:

1. **First iteration** (commit `55e31e6`) passed `--shadow-database-url`
   as a CLI flag. Failed with usage help — that flag is not exposed
   on the `migrate diff` subcommand even though Prisma's error
   message suggests it ("You must pass the `--shadow-database-url`
   flag or set `datasource.shadowDatabaseUrl` in your
   prisma.config.ts"). CLI quirk: the suggested flag doesn't exist
   on this subcommand.
2. **Second iteration** (commit `54eca07`) declared
   `shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL` in
   `prisma.config.ts` `datasource` block. The flag combination was
   accepted; drift detect ran and exited `2` with a non-empty diff.
   **But the diff was a false positive**: pre-existing structural
   mismatch between the `20260424_hnsw` migration (raw SQL
   `CREATE INDEX … USING hnsw`) and `schema.prisma` (Prisma's
   declarative language has no HNSW index syntax — the closest is
   `extensions = [pgvector(...)]`, which declares the extension but
   not the specific HNSW index type or parameters). Result: every
   PR would fail drift detect with `[-] Removed index on columns
(embedding)` regardless of any schema change, blocking all
   merges.

The drift step + shadow DB + config-side `shadowDatabaseUrl` were
reverted in the same v0.5.2 PR's third iteration. The CI job
retains its `prisma migrate deploy` against the pgvector service
container (established in v0.5.1 ADR-0042), and the integration
tests exercise `workspaceId`-aware routes that would fail if
schema and DB diverged — that's the _indirect_ drift detection
available under Prisma's HNSW representation gap.

**Two follow-up paths considered for v0.5.3**:

- **DB-introspection snapshot**: capture a canonical
  `prisma db pull` output post-migration as a tracked file, diff
  PR-time output against it. Rejected — `prisma db pull` is gated
  by what `schema.prisma` can express, so HNSW indexes and `USING
vector` index parameters fall outside its vocabulary; output
  would either silently omit them or embed them as comments. The
  same Prisma-representation gap that broke `migrate diff`
  partially affects `db pull` too.
- **Custom Node `pg_catalog` assertion script** (chosen, **shipped
  in v0.5.3 per this PR's follow-up commit**): `apps/knowledge/scripts/verify-schema-shape.mjs`
  connects to the migrated DB via `pg`, queries
  `information_schema.tables`, `information_schema.columns`,
  `pg_class + pg_index + pg_am`, and `pg_extension`, and asserts
  every entry in `apps/knowledge/prisma/expected-shape.json`
  exists. Because pg_catalog reports the actual physical DB state,
  HNSW indexes appear correctly with `amname = 'hnsw'` —
  sidestepping Prisma's representation gap entirely. Wired into
  the `knowlex integration (pgvector)` CI job after `Apply
migrations`. Exit codes: 0 = OK, 2 = drift, 1 = error.

The chosen approach declares its expected shape as data
(`expected-shape.json`) rather than as code, which makes the
schema-vs-manifest contract reviewable in PR diffs and explicit
about what the gate cares about. Adding a new column to a
migration without updating the manifest is exactly what the gate
catches.

**What ChatGPT's external review surfaced** (2026-04-27 audit)

A side-by-side review with an external LLM (model unspecified;
prompt and response archived in
`~/.claude/other-projects/craftstack/`) confirmed the architecture
direction (`vercel-build` split, `prisma` in `dependencies`,
`turbo.json` passThroughEnv) is canonical Vercel + Prisma + Neon
practice. Three corrections / additions surfaced:

1. **Hallucination flagged**: the review claimed Vercel Hobby
   build timeout is "~45-60 seconds". Vercel docs actually
   document the build timeout as **45 minutes** for Hobby; the
   10s figure is the runtime function execution timeout, not
   build. The v0.5.0 migration runs in <2s so this is not
   load-bearing here either way.
2. **Preview = Prod confirmed via probe** (see above).
3. **Expand → Backfill → Contract pattern recommendation**:
   the v0.5.0 `20260426_workspace_tenancy/migration.sql` collapses
   all three steps into a single migration file (additive nullable
   column → `UPDATE` backfill → `ALTER NOT NULL` + FK + index).
   This is fine for a low-write live URL where the backfill window
   has zero concurrent writes (Knowlex's actual state at v0.5.0
   ship), but in general this is **not the right pattern** —
   concurrent writes during the backfill window would have
   produced `Document` rows with `workspaceId IS NULL` that the
   final `ALTER NOT NULL` step would have rejected. Future
   migrations introducing NOT NULL columns on tables with live
   writes should split into three deploys: deploy 1 = additive
   column nullable + dual-write code; deploy 2 = backfill
   migration; deploy 3 = `ALTER NOT NULL` + drop dual-write code.
   This is documented for ratchet but not enforced — adding a
   linter / convention check is Tier C follow-up.

## Related

- [ADR-0042](0042-knowlex-test-observability-stack.md) — established the original `prisma generate && next build` build pipeline; this ADR extends it.
- [ADR-0047](0047-knowlex-workspace-tenancy-plan.md) — the v0.5.0 schema partitioning whose migration was the first to surface this gap.
- [ADR-0046](0046-zero-cost-by-construction.md) — the cost-safety regime; a free-tier deploy still has an ops contract.
- [ADR-0049](0049-rag-eval-client-retry-contract.md) § 8th arc (this incident: Run 7 surfaced the schema drift → ADR-0051 ships the structural fix). Also § Measurement contract for the ingest path's retryFetch coverage which would have masked the symptom on the eval side if not for the empty-body / wrong-status-code distinction.
- Prisma docs — [Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel) and [Deploy database changes with Prisma Migrate](https://www.prisma.io/docs/guides/deployment/deploy-database-changes-with-prisma-migrate).

## Not in scope

- **Preview-deploy DB separation (Neon branch per preview)** —
  CONFIRMED critical from this PR's probe; tracked as v0.5.3 PR
  with the Vercel-Neon integration setup. The wiring is dashboard-
  side (Vercel project → Integrations → Neon) and cannot be
  configured purely from this repo, so it can't ship in a
  code-only PR.
- **A formal rollback runbook with worked examples** — Tier B
  follow-up.
- **Switching to `DIRECT_URL` (Neon's pooled vs direct split)** —
  `prisma.config.ts` already prefers `DIRECT_DATABASE_URL` and
  falls back to `DATABASE_URL`. Both env vars are present in the
  Vercel project (per build warning). Whether they actually point
  at different connection strings (one pooled, one direct) needs
  to be verified at the Vercel + Neon dashboard layer; if both
  are the pooled URL, migration locking under concurrent deploys
  could fail (per Prisma docs on pgbouncer). Verifying is dashboard-
  side; tracked alongside the Neon branching follow-up.
- **Long-running migration handling** — current migration set is
  bounded (additive columns, backfill of <30 rows, single-column
  index). When tables grow past ~100k rows or migrations include
  destructive ALTERs, the build-time pattern in this ADR may need
  to move to a separate "deploy hook" job (GitHub Actions step
  before Vercel deploy fires); see ChatGPT review § Q2 Option B.
