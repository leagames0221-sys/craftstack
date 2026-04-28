# ADR-0061: Auth.js on Knowlex + multi-tenant transition — closing I-01 (single-tenant honest disclose)

- Status: Accepted
- Date: 2026-04-28
- Tags: auth, tenancy, knowlex, multi-tenant, defense-in-depth
- Companions: [ADR-0047](0047-knowlex-workspace-tenancy-plan.md) (the plan and the v0.5.0 schema-partitioning half), [ADR-0023](0023-four-tier-rbac.md) (apps/collab role model that the Knowlex Membership.role string mirrors), [ADR-0046](0046-zero-cost-by-construction.md) (cost-attack regime: anonymous writes were a vector this ADR closes), [ADR-0060](0060-pusher-private-channels-migration.md) (the prior T-NN graduation that established the honest-disclose-to-closure pattern this ADR replicates for I-01)

## Context

ADR-0047 shipped Knowlex's schema partitioning in v0.5.0: a `Workspace` table, a single seeded `wks_default_v050` demo workspace, every `Document` backfilled with a `workspaceId` foreign key. The ADR's § Status block was Partially Accepted: schema partitioning shipped; **member-based access control was deferred** until Auth.js landed on the Knowlex deploy.

That deferred half was disclosed in [`docs/security/threat-model.md`](../security/threat-model.md) as **I-01**:

> Knowlex is single-tenant per ADR-0039 MVP scope; ADR-0047 v0.5.0 partial added `workspaceId NOT NULL` schema partitioning so the multi-tenant migration path is one route-guard layer away. RLS + `withTenant()` per ADR-0010 is design-phase and deferred. Auth-gated `requireWorkspaceMember` route guards land once Auth.js ships on Knowlex (next arc).

Since v0.5.0 the gap had been disclosed for ~6 months. Per ADR-0059's honest-disclose TTL pattern, I-01 was not on a date-bound revisit cadence (it was tagged "deferred until Auth.js lands") but it WAS on the roadmap. ADR-0060 demonstrated the discipline of graduating a T-NN disclose to structural closure (Pusher private channels). I-01 is the second graduation candidate, and the largest disclosed gap on the project — the `requireWorkspaceMember` mechanism named in ADR-0047 was on roadmap from day 1.

## Decision

Add Auth.js v5 to apps/knowledge with the same OAuth + JWT-session pattern as apps/collab, then ship a multi-tenant access-control layer that closes I-01 while preserving the live demo experience.

### Demo split — preserve the public RAG demo

The Knowlex live deploy at `craftstack-knowledge.vercel.app` has been a public RAG demo since v0.3.x: anyone visits `/`, types a question, gets a streamed Gemini answer grounded in the demo corpus. That demo is the project's strongest brand signal — a hiring reviewer can probe it in 30 seconds. **Auth-gating the demo would destroy that signal**, so v0.5.12 does not take that path.

Instead, the access layer is **two-shaped**:

1. **`requireDemoOrMember`** (read paths — `/api/kb/ask`, `/api/kb/stats`, `/api/kb/documents`):
   - Demo workspace (`wks_default_v050`): returns `kind: "anonymous-demo"` for any caller. No session check, no DB query. The live demo continues.
   - Other workspace: returns `kind: "member"` only when the signed-in user has a `Membership` row. 401 anonymous, 403 non-member.
2. **`requireMemberForWrite`** (write paths — `/api/kb/ingest`, future delete):
   - Always requires a signed-in session, even for the demo workspace. **Anonymous writes are explicitly disallowed** — this closes the cost-attack vector where anyone could fill the demo corpus (cf. ADR-0046's cost regime) **and** stops anonymous defacement of the demo.
   - Demo workspace + signed-in user: an OWNER `Membership` is auto-created (idempotent upsert). The demo workspace is intentionally a shared sandbox — granting OWNER on first write is the simplest ergonomic that lets a signed-in reviewer try the full ingest flow without needing a separate "create my own workspace" CTA. v0.6.0+ candidate: a per-user namespace with a "create personal workspace" UX.
   - Other workspace + signed-in user: requires existing `Membership` row. 403 if absent.

### Schema additions (Knowlex Prisma migration `20260428_auth_tenancy`)

The migration is **purely additive**:

- `User`, `Account`, `Session`, `VerificationToken` — Auth.js v5 standard tables, mirrored verbatim from apps/collab.
- `Membership` — user × workspace × role (free-string for forward compat; current values OWNER / EDITOR / VIEWER, only "any membership" checked in v0.5.12 per § Scope below).
- The existing `Workspace` model gains a `members Membership[]` relation. No column changes; no existing-row mutations. Backward-compatible with the v0.5.0 → v0.5.11 deployed state.

The seeded `wks_default_v050` row from `20260426_workspace_tenancy` is untouched — anonymously readable continues to work because `requireDemoOrMember` short-circuits before any session/DB lookup.

### Auth.js v5 mirroring apps/collab

`apps/knowledge/src/auth/{config,index}.ts` mirror the apps/collab structure (`config.ts` for the NextAuthConfig, `index.ts` for the `NextAuth(authConfig)` instantiation). Provider list: Google + GitHub OAuth. JWT session strategy (same Edge-Runtime-compat reasoning as apps/collab; superseded ADR-0003).

The `PrismaAdapter` is cast to `any` because the Knowlex Prisma client is generated to a custom output path (`node_modules/.prisma-knowlex/client`) per ADR-0018, so its TS types don't structurally match `@auth/prisma-adapter`'s `PrismaClient` signature even though the runtime methods (user, account, session, verificationToken) are all present. Same pragmatic pattern as apps/collab; safe in practice because the adapter only invokes a fixed set of methods on a schema that mirrors Auth.js v5 verbatim.

The CI-only Credentials provider from apps/collab (ADR-0038) is intentionally **not** replicated yet — the Knowlex E2E surface is still public-demo + smoke. If and when an authed Playwright suite lands on Knowlex, the same triple-gate pattern (`VERCEL!=1 + E2E_ENABLED=1 + E2E_SHARED_SECRET`) can be copied across.

### Schema canary (`/api/health/schema`) extension

The `EXPECTED` constant in `apps/knowledge/src/app/api/health/schema/route.ts` is extended with the 5 new tables (User / Account / Session / VerificationToken / Membership). The companion `expected.test.ts` cross-checks both directions: every row in `EXPECTED` exists in `schema.prisma`, and every model in `schema.prisma` is in `EXPECTED`. A future column drop without an `EXPECTED` update fails CI immediately (axis 2 of the ADR-0057 framework).

### Scope of v0.5.12

Shipped:

- Schema migration (5 new tables, additive)
- Auth.js v5 (Google + GitHub OAuth)
- `/api/auth/[...nextauth]` route handler
- `/signin` page (minimal, two OAuth buttons)
- `requireDemoOrMember` + `requireMemberForWrite` helpers
- Route guards on `/api/kb/ask` (read) + `/api/kb/ingest` (write)
- Schema canary EXPECTED extension
- Vitest for `auth/access.ts` (15 cases: read/write × demo/non-demo × authed/anonymous × member/non-member)

Explicitly out-of-scope (v0.6.0+ candidates):

- Per-user "create personal workspace" UX
- Role-based gates inside Membership (current check is "any membership", not OWNER vs EDITOR vs VIEWER)
- `/api/kb/documents` and `/api/kb/stats` route guards (these read paths are still anonymous in v0.5.12 — they expose only document counts and metadata, not content; tightening them is the next ratchet)
- Authed Playwright suite on Knowlex (collab has one; knowledge does not yet)
- Cross-workspace document migration tools

## Consequences

### Positive

- **I-01 closed** as a structural change, not a deferral. The access-control half of ADR-0047 (deferred since v0.5.0) is now shipped. Second T-NN/I-NN graduation in two ships, demonstrating the ADR-0059 honest-disclose TTL pattern produces actual closure.
- **Demo brand preserved**. The live RAG demo at `craftstack-knowledge.vercel.app/` remains anonymously accessible. A hiring reviewer's 30-second probe is unaffected. Sign-in unlocks ingest + future per-user workspaces.
- **Cost-attack vector narrowed**. Anonymous ingest is now disallowed — a script-kiddie spamming the demo corpus would now require an OAuth signin first (rate-limited by provider). ADR-0046's `$0/mo by construction` regime tightens by one layer.
- **Schema migration is additive + backward-compatible**. A failed deploy can roll back to v0.5.11 by reverting the route-guard code; the new tables stay in place but are inert (no callers).

### Negative

- **AUTH_SECRET + OAuth credentials env config required for live activation**. The PR ships code + migration; the live deploy needs `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` configured on the knowlex Vercel project. Without them:
  - Demo `/api/kb/ask` against `wks_default_v050` continues to work (no session lookup needed)
  - `/api/kb/ingest` 500s (Auth.js boots but signin can't complete)
  - `/api/auth/*` returns 500
  - Sign-in UI is unreachable
- This is documented as a deploy-time prerequisite. The ADR is still Accepted — code is structurally complete; activation is a one-time env config.
- **Demo workspace OWNER auto-grant is intentionally promiscuous**. Any signed-in user gets OWNER on the demo. This is the simplest ergonomic for v0.5.12 but means "OWNER" is currently meaningless on the demo (every signed-in user is OWNER). v0.6.0+ moves to per-user personal workspaces where role gates start to matter.
- **`requireDemoOrMember` allow-list is hardcoded to `wks_default_v050`**. Adding another anonymously-readable workspace requires a code change (deliberate by design — see ADR § Demo split). No env-flag-driven workspace privacy is possible without a follow-up ADR.
- **Role checks are weak in v0.5.12**. Membership.role is recorded but the only assertion is "row exists". Distinguishing OWNER vs VIEWER (and rejecting VIEWER writes) is a v0.6.0+ ratchet.

### Recursive integrity (per ADR-0059 trigger rules)

ADR-0059 declared the audit-framework frozen, with future ratchets requiring an external trigger. ADR-0061 is **not** an audit-framework ratchet — it's a product-feature ship that closes a long-standing honest-disclose. The freeze rules apply to the framework axes, not to the deferred-feature backlog. ADR-0061's relationship to ADR-0059 is: "the ADR-0059 honest-disclose TTL pattern made it discipline-bound to revisit I-01 by 2026-Q3 or earlier; ADR-0060 was the first such revisit (T-01 → closure); ADR-0061 is the second (I-01 → closure)." The pattern is producing closures, not perpetual disclosure.

## Alternatives

- **Lock the entire `craftstack-knowledge.vercel.app` behind auth**. Rejected — destroys the live RAG demo brand signal. The two-shape access pattern (demo-readable + authed-writable) is the better ergonomic.
- **Move the demo to `/demo` and require auth on `/`**. Rejected for v0.5.12 because the existing public links (Loom video, README walkthrough, hiring sim sessions) all reference `/` as the demo URL. Moving the demo would break ~6 months of public links. v0.6.0 candidate: keep `/` as demo, add `/app` as authed-only with personal workspace.
- **Ship `requireWorkspaceMember` without the demo-allowlist split (= all reads require auth)**. Rejected — same brand argument as the first alternative. The demo allowlist is the explicit decision to preserve anonymous read access for one specific seeded workspace, not a general "make stuff public" flag.
- **Shared `packages/auth` between collab and knowledge**. Rejected for v0.5.12 because the two apps have meaningfully different provider needs in the long run (collab has the E2E credentials provider, knowledge has its own demo-workspace logic) and forcing them to share would create coupling bugs. The auth/ subdirectories are intentionally per-app, mirroring apps/collab's pattern. v0.7.0+ candidate if the duplication grows past ~50 lines.
- **Add Membership before Auth.js (= phased migration)**. Rejected because Membership has no real meaning without User identities; shipping the table without populating it would produce a dead schema until v0.5.13. The simultaneous Auth.js + Membership ship is one cohesive migration.

## Implementation status

Shipped in v0.5.12:

- `apps/knowledge/prisma/schema.prisma` — 5 new models (User / Account / Session / VerificationToken / Membership) + Workspace.members relation
- `apps/knowledge/prisma/migrations/20260428_auth_tenancy/migration.sql` — additive migration
- `apps/knowledge/package.json` — `@auth/prisma-adapter` + `next-auth` dependencies
- `apps/knowledge/src/auth/config.ts` (new) — NextAuthConfig
- `apps/knowledge/src/auth/index.ts` (new) — `NextAuth(authConfig)` exports
- `apps/knowledge/src/auth/access.ts` (new) — `requireDemoOrMember`, `requireMemberForWrite`, `WorkspaceAccessError`, `DEMO_WORKSPACE_ID` constant
- `apps/knowledge/src/auth/access.test.ts` (new) — 15 Vitest cases pinning the read/write × demo/non-demo × authed/anonymous matrix
- `apps/knowledge/src/app/api/auth/[...nextauth]/route.ts` (new) — Auth.js catch-all handlers
- `apps/knowledge/src/app/signin/page.tsx` (new) — minimal signin UI
- `apps/knowledge/src/app/api/kb/ask/route.ts` — wired `requireDemoOrMember`
- `apps/knowledge/src/app/api/kb/ingest/route.ts` — wired `requireMemberForWrite`
- `apps/knowledge/src/app/api/health/schema/route.ts` — `EXPECTED` extended with 5 new tables
- `docs/security/threat-model.md` — I-01 status changed to **Resolved in v0.5.12 (ADR-0061)**
- `docs/adr/0047-knowlex-workspace-tenancy-plan.md` — § Status updated: deferred → shipped
- This ADR
- `docs/adr/README.md` — index entry
- `CHANGELOG.md` — v0.5.12 entry
- `docs/adr/_claims.json` — ADR-0061 entries (auth route exists, requireWorkspaceMember helper exists, Membership table claim, signin page exists)
- `scripts/generate-attestation-data.mjs` — `Auth-gated Knowlex` removed from `scope.deferred`; `I-01` removed from `honestScopeNotes`; `attestation-data.test.ts` updated to assert I-01 absence
- README + portfolio-lp + page.tsx Stat block — ADR count 59 → 60; Vitest 224 → 239 (174 collab + 65 knowledge)

### Verification

```bash
node scripts/check-doc-drift.mjs    # → 0 failures (ADR 60, Vitest 239, banner v0.5.12)
node scripts/check-adr-claims.mjs   # → all pass; PR-time integrity asserts ADR-0061 has _claims.json entries
node scripts/check-adr-refs.mjs     # → 0 dangling
pnpm test                           # → 239 passed (174 collab + 65 knowledge, +15 from access.test.ts)
```

### Live activation prerequisites (post-merge)

Configure on the knowlex Vercel project (Settings → Environment Variables):

```
AUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GITHUB_CLIENT_ID=<from GitHub OAuth App>
GITHUB_CLIENT_SECRET=<from GitHub OAuth App>
```

Until configured, the demo workspace `/api/kb/ask` continues to work (no session needed); ingest + non-demo paths return 500. This is honest-disclosed in CHANGELOG.md and in this ADR § Negative.
