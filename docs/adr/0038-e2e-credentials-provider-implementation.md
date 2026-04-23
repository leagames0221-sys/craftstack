# ADR-0038: Implementation of the E2E credentials provider + auth-scoped Playwright suite

- Status: Accepted (implements [ADR-0022](0022-e2e-credentials-provider.md))
- Date: 2026-04-23
- Tags: testing, auth, ci, security

## Context

ADR-0022 reserved the pattern of an Auth.js `Credentials` provider that only registers in non-production builds, so Playwright could sign in without hitting Google / GitHub OAuth. Implementation was deferred until the core feature set stabilized. Session 251's breadth of features now makes authenticated E2E coverage the biggest remaining gap: unit tests cover pure logic, smoke covers public pages, but nothing exercises the `/dashboard` → `/w/...` → `/w/.../b/...` flow end-to-end.

## Decision

Implement the provider with a triple safety gate and wire an authenticated Playwright suite to it:

1. **Credentials provider registration is gated on ALL of**:
   - `process.env.VERCEL !== "1"` — mechanically excludes every Vercel-hosted deployment. Vercel always injects `VERCEL=1`. We originally used `NODE_ENV !== "production"` but `next build` + `next start` both run with `NODE_ENV=production`, which is also the mode CI serves from — so a `NODE_ENV` gate would break CI while providing no prod protection. The Vercel-env check is the honest one.
   - `process.env.E2E_ENABLED === "1"` — off by default.
   - `process.env.E2E_SHARED_SECRET` present and ≥ 16 bytes.
2. **A valid credentials signin also requires**:
   - The email to be in a short hard-coded allowlist (`e2e+owner@e2e.example`, `e2e+editor@e2e.example`, `e2e+viewer@e2e.example`).
   - The `secret` field to constant-time-match `E2E_SHARED_SECRET` (≥16 chars).
   - The user to exist in the DB (so the seed step is authoritative for which identities can sign in).
3. **CI wiring**:
   - `.github/workflows/e2e.yml` boots a Postgres 16 service container, runs `prisma migrate deploy` + the seed, builds and starts Next with `E2E_ENABLED=1` + `E2E_SHARED_SECRET=<secret>`, then runs `playwright.auth.config.ts`.
   - Playwright's `setup-auth.ts` fetches the CSRF token, POSTs `/api/auth/callback/e2e`, verifies `/api/auth/session`, and writes `playwright/.auth/<role>.json` for the authed project to consume.
4. **Suite coverage**:
   - `authed/dashboard.spec.ts` — workspace list, palette open/filter, shortcuts help, notifications bell.
   - `authed/workspace.spec.ts` — membership-scoped list, slug conflict 409, happy-path workspace create.
   - `authed/board.spec.ts` — board render, URL-as-state filter, shape of the move API.
   - `authed/rate-limits.spec.ts` — notifications + search sanity + per-user rate limit trips at the cap.
   - `authed-a11y.spec.ts` — axe-core against `/dashboard`, `/w/e2e`, `/w/e2e/b/seed-e2e-board` with zero-blocking-violation gate (matching the public pages' policy).

## Consequences

Positive:

- Real regression coverage on the authenticated surface; a broken OAuth callback, RBAC gate, proxy redirect, or Prisma migration now fails CI.
- A11y coverage now spans the pages that actually contain interactive UI (palette, bell, DnD, modals).
- The ADR-0022 plan is closed out in code, not just on paper.
- Zero external cost — GitHub Actions services are free for public repos; Postgres is the `postgres:16` public image.

Negative:

- The auth-suite is serial (`workers: 1`) because every test shares the E2E workspace; a fresh CI DB per run makes this safe but hard to parallelize without additional seed variants.
- The Credentials provider pulls in `next-auth/providers/credentials` bundle weight even in production builds (the module is imported but the provider itself isn't registered). Negligible — a few KB, tree-shaken as dead branch except for its import graph.

## Alternatives Considered

- **Skip authed E2E, keep only smoke + unit** — rejected; we've outgrown that coverage level given the ADR count.
- **Stub Auth.js entirely in test** — rejected; stubs diverge from the real JWT flow and would miss a broken session cookie parse.
- **Hit real OAuth in CI** — rejected; brittle, rate-limited, and adds a secret surface area we don't need.
- **Use Vercel Preview environments as the E2E target** — rejected; the DB state is shared with real humans testing the demo, and we'd need a separate preview DB per run anyway.

## Related

- [ADR-0022](0022-e2e-credentials-provider.md) — the plan this ADR implements.
- [ADR-0034](0034-axe-core-a11y-in-playwright-smoke.md) — the a11y gate policy the authed suite extends to authenticated pages.
