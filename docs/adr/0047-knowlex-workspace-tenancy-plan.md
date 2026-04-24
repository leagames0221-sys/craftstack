# ADR-0047: Knowlex workspace tenancy — plan and scoped migration

- Status: Proposed (implementation tracked as Session 256-A)
- Date: 2026-04-24
- Tags: knowlex, tenancy, schema, migration, scope
- Supersedes (on implementation): the "no tenancy in the MVP" clause of [ADR-0039](0039-knowlex-mvp-scope.md)

## Context

[ADR-0039](0039-knowlex-mvp-scope.md) deliberately shipped Knowlex as a
single-tenant vertical slice: three tables (`Document`, `Chunk`, `Embedding`),
no `Tenant` / `TenantMember` / RLS story, single-user-single-corpus. That was
the right call for a first live deploy — it made "two apps" a runtime claim
rather than a schema claim.

The cost of that call, six sessions later, is a **claim-reality drift on the
portfolio surface**. README sub-header and `docs/hiring/portfolio-lp.md` both
advertised Knowlex as a "multi-tenant AI knowledge SaaS" because the
design-phase ADRs 0011–0015 envisaged it that way. A cold hiring-manager
review ([Session 255 / run #2](../../memory/craftstack/37_hiring_sim_run_2_2026-04-24.md))
pushed on exactly that gap: reviewer Q2 asked why measured eval numbers were
absent, and a distinct weak signal called out the "Multi-tenant" claim
against the tenantless reality.

Short-term, v0.4.2 softened the claim text (README tagline edit, `SAMPLE_CONTEXT`
rewrite, "design-phase aspirational" banner on hiring docs). Long-term, the
only way to make the claim honest is to **implement workspace tenancy on
Knowlex** using the same shape Boardly already ships (ADR-0023 four-tier RBAC,
ADR-0029 cross-workspace guards on set-mutations, Workspace/WorkspaceMember
schema).

This ADR is the plan. Implementation lands in Session 256-A behind a
`TENANCY_ENABLED` feature flag, with schema migration backward-compatible so
main stays reviewer-ready at every commit (per the ratchet-model discipline
established after run #2).

## Decision

Port Boardly's workspace model into `apps/knowledge` with the minimum surface
change to close the claim-reality gap, without inheriting Boardly-specific
complexity that Knowlex does not need yet (invitations, labels, @mentions).

### 1. Schema addition (forward-compat)

Add three Prisma models to `apps/knowledge/prisma/schema.prisma`:

- **`Workspace`** — `id` (cuid), `name`, `slug` (unique), `createdAt`,
  `createdById`. No billing fields yet; the "$0/mo" contract says there
  cannot be billing fields that imply a paid tier.
- **`WorkspaceMember`** — `id`, `workspaceId`, `userId`, `role`
  (`OWNER` | `ADMIN` | `EDITOR` | `VIEWER` — same four-tier comparator
  Boardly uses per ADR-0023), `joinedAt`. Unique compound index on
  `(workspaceId, userId)`.
- **`Document.workspaceId`** — new foreign key column on the existing
  `Document` table. Nullable in the initial migration so existing rows
  backfill to a "default workspace" seed row without a table-lock;
  tightened to `NOT NULL` once the backfill completes.

`Chunk` and `Embedding` do not gain a `workspaceId` column directly — they
inherit it transitively through `Document.workspaceId`. Retrieval filters on
`chunk.document.workspaceId` via an indexed join, not on a duplicated column,
to keep pgvector's HNSW index parameters untouched (HNSW does not support
compound vector+scalar indexing efficiently on pgvector's current release, so
pre-filtering by workspace happens in the SQL that feeds the kNN, not inside
the vector index itself).

### 2. Migration strategy (main stays green)

Two-step forward-compat migration:

1. **Step 1 — additive**: migration adds the three models with `workspaceId`
   nullable. A data backfill in the same migration creates one default
   workspace (`name: "Default", slug: "default"`) and sets every existing
   `Document.workspaceId` to it. Deploys cleanly against the live Neon
   instance with zero read-path interruption (existing code ignores the new
   column).
2. **Step 2 — tightening**: once Step 1 has shipped and the data is
   confirmed backfilled, a second migration drops the `NULL` constraint on
   `Document.workspaceId`. Lands in a separate PR so a reviewer can see the
   two-phase pattern explicitly.

The 441-line design-phase schema at `apps/knowledge/prisma/schema.design.prisma.bak`
(preserved per ADR-0039 § Decision) is the reference for _future_ fields
(`Folder`, `DocumentVersion`, `Conversation`, `Message`, `Citation`,
`Feedback`, `ApiKey`, `Webhook`, `AuditLog`, `Usage`). This ADR explicitly
does **not** resurrect any of those — the claim being made is "workspace
tenancy exists," not "enterprise feature parity."

### 3. Route guards (Boardly pattern)

Every Knowlex route that reads or writes `Document` / `Chunk` / `Embedding`
gains a `requireWorkspaceMember(workspaceId, atLeast: Role)` guard that
mirrors Boardly's ADR-0029 cross-workspace-guard pattern:

- `GET /api/kb/documents` — list scoped to `workspaceId` query param;
  requires `VIEWER`.
- `POST /api/kb/ingest` — `workspaceId` in request body; requires `EDITOR`.
- `DELETE /api/kb/documents` — requires `EDITOR`; 403 on cross-workspace id.
- `POST /api/kb/ask` — `workspaceId` in request body; retrieval `WHERE`
  clause includes `document.workspaceId = $1`; requires `VIEWER`.
- `GET /api/kb/stats` — aggregated across all workspaces the caller is a
  member of, not global. Unauthenticated callers still see a sanitized
  shape (total across public-default workspace only).
- `GET /api/kb/budget` — stays as-is; budget is per-container, not per-workspace.

Integration tests (pgvector service container in `ci.yml`) add a
cross-tenant leakage suite that confirms workspace A's documents never
appear in workspace B's retrieval, ingest, or listing responses.

### 4. UI surface (minimum viable)

`/kb` gains a workspace switcher in the top nav (same component pattern as
Boardly's workspace switcher). Default workspace is auto-selected on first
sign-in. Workspace creation is a separate `/kb/workspaces/new` route behind
`TENANCY_ENABLED` so the flag can be flipped on/off without removing UI code.

No invitations UI in this arc. Workspace membership is seeded via a
`/api/kb/workspaces/:id/members/self` POST that either promotes an
authenticated user to `VIEWER` on a public-default workspace or 403s on a
private one. Full invitation flow is a separate follow-up ADR.

### 5. Feature flag

`NEXT_PUBLIC_TENANCY_ENABLED` (client) + `TENANCY_ENABLED` (server) — when
`false`, all guards short-circuit to "single default workspace everyone can
read/write," preserving v0.4.x behaviour byte-identical. Flip happens on
Vercel env after Step 2 migration ships and integration tests pass.

## Consequences

**What a reviewer reading the repo post-implementation sees**

- README tagline and `/docs/api` description converge: Knowlex becomes
  genuinely multi-tenant, not softened-to-single-tenant.
- ADR-0039 status gains a "Superseded on workspace tenancy by ADR-0047" line.
- Hiring-docs banners referring readers to ADR-0039 also link to ADR-0047;
  the "design-phase aspirational" framing shrinks to the features this ADR
  does NOT implement (invitations, API keys, folders).
- Cross-tenant leakage test row appears in the integration suite (visible in
  CI logs), giving future reviewers a grep-able artefact when asking "how do
  you prove tenancy isolation?".

**Trade-offs admitted**

- **Backfill default workspace is a trust boundary.** Existing documents
  become public-default on migration. If any Knowlex document ever contained
  sensitive content, the migration would expose it to everyone who ever
  signs in. Mitigation: the live deploy only contains three golden-set
  seed documents (self-describing portfolio content). Before real
  third-party documents ever enter the system, this ADR must be re-read
  and the migration either reversed or supplemented with per-document
  re-assignment prompts.
- **HNSW index not workspace-partitioned.** Pre-filter in SQL is
  O(workspace-size) per query; at current scale (<10k chunks per workspace)
  this is sub-10ms and fine. If any workspace exceeds 100k chunks, a
  per-workspace HNSW index (one index per workspace id, maintained via
  partial indexes) becomes the next arc. ADR-0041's IVFFLAT→HNSW precedent
  shows the migration pattern.
- **No invitation flow.** Workspace creation is "create → you're the owner;
  only you can grant others access directly via the admin panel." This
  mirrors Boardly v0.0.1 → v0.1.0 pre-invitation scope. ADR-0026's
  token-hashed invitation pattern is the future port.
- **API key / machine auth deferred.** `/api/kb/ask` remains
  session-authenticated or public (for the default workspace). No per-user
  rate-limit differentiation yet. Budget-layer cost-safety (ADR-0037 /
  ADR-0046) is per-container and does not need tenancy to function.
- **Knowlex stats aggregation changes shape.** `GET /api/kb/stats` today
  returns a global `{documents, chunks, embeddings, ...}` shape. Post-ADR
  it aggregates across workspaces visible to the caller. The field names
  stay identical so dashboards (UptimeRobot, operator probes) do not break.
  A new `X-Knowlex-Scope: workspaces=N` response header discloses the
  aggregation count for operators who care.

**What this unblocks**

- ADR-0048 (undo/redo ↔ optimistic locking semantics — also landing in
  Session 256-A bundle) can reference "workspace-scoped activity" uniformly
  across Boardly and Knowlex.
- The claim-reality drift flagged by run #2 gets structurally solved, not
  just softened on the surface.
- Future portfolio additions (a third app, a shared identity pattern,
  federated search across workspaces) have a concrete multi-tenant
  substrate to build on.

## Related

- [ADR-0023](0023-four-tier-rbac.md) — four-tier RBAC comparator, source of the Role enum reused here
- [ADR-0029](0029-cross-workspace-guards.md) — cross-workspace guard pattern on set-mutations
- [ADR-0039](0039-knowlex-mvp-scope.md) — original "defer tenancy" decision this ADR supersedes on the tenancy dimension
- [ADR-0041](0041-knowlex-ivfflat-to-hnsw.md) — precedent for index-level migration inside Knowlex
- [ADR-0046](0046-zero-cost-by-construction.md) — cost-safety regime this arc must not regress

## Not in scope

- Invitation flow (separate ADR)
- API keys / machine auth (separate ADR)
- Per-workspace Gemini key bring-your-own (would break the `$0/mo` guarantee's "one operator, one key" shape)
- Audit log, usage metering, feedback loop (design-phase ADRs 0011–0015, stay deferred)
- Migration of the 441-line design schema back into the live DB (explicitly out of scope — this ADR shipped minimal additions, not a schema expansion)
