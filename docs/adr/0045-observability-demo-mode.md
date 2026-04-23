# ADR-0045: Observability with a zero-signup demo mode

- Status: Accepted
- Date: 2026-04-24
- Tags: observability, sentry, demo, portfolio

## Context

ADR-0044 wired Sentry into both apps behind a DSN gate. The gate was correct — builds succeed without any Sentry configuration — but it created a portfolio problem: a reviewer reading the repo can see `captureException()` in source and `@sentry/nextjs` in the lockfile, but has no way to verify the pipeline is actually wired end-to-end unless they personally sign up for Sentry, create two projects, copy two DSNs into two Vercel projects, redeploy, and trigger a synthetic error.

That's a large enough step that it won't happen in a 5-minute code review. So "observability is wired" becomes another line of README prose instead of a demonstrable feature.

The rest of the repo deliberately avoids this shape — `/playground` has a deterministic canned demo when `GEMINI_API_KEY` is unset, invitation email falls back to a console log when `RESEND_API_KEY` is unset, Pusher mutations skip the broadcast when credentials are unset — so that every advertised feature is _browsable_, not just _claimed_.

## Decision

Route every `captureException` call through a **unified seam** (`src/lib/observability.ts`) that has two backends:

1. **Sentry** — when `SENTRY_DSN` (server) or `NEXT_PUBLIC_SENTRY_DSN` (client) is set and the `@sentry/nextjs` SDK is initialised by the instrumentation hooks. Captures are forwarded upstream into the configured project. This is the production path.

2. **In-memory ring buffer** — when no DSN is configured. Holds the last 50 captures per container process so that a reviewer can prove the pipeline is wired by pointing their browser at `/api/observability/captures`. The ring is per-process and per-container — resets on redeploy, lives only for the container's warm window on Vercel — which is fine for a demo surface; it isn't a production observability store.

Both backends are written to in parallel when Sentry is configured, so the endpoint doubles as a "last N errors" local tail even against a live deploy. The seam never throws: observability is best-effort and cannot brick a request.

`/api/observability/captures` is gated: open by default in dev / preview, closed in production unless the operator explicitly sets `ENABLE_OBSERVABILITY_API=1`. Production default is closed because the ring is per-container and contains server-side error text — leaking that on the public deploy would be worse than the reviewability win.

Added to both `apps/collab/src/lib/observability.ts` and `apps/knowledge/src/lib/observability.ts` as near-duplicates. This mirrors the deliberate copy-don't-package-yet stance from ADR-0043 (`kb-rate-limit` + `global-budget`). Promoting to `packages/observability-shared/` is deferred until either app needs to differ on backend shape.

Wired into:

- **Client**: `src/app/error.tsx` on both apps — every React error that hits the global boundary forwards to the seam.
- **Server**: `apps/knowledge/src/app/api/kb/{ask,ingest}/route.ts` — the two routes that can realistically fail in a way worth sampling (retrieve crash, ingest FK violation, Gemini rate-limit, etc.).

Shipped 5 Vitest cases covering the seam directly (`observability.test.ts`): records Error + string payloads, caps the ring at the documented maximum, returns defensive copies, and never throws on cyclic payloads that would crash `JSON.stringify`.

## Consequences

Positive:

- The error pipeline is now _demonstrable_, not just _configured_. A reviewer cloning the repo can `pnpm dev`, trigger an error (visit `/api/kb/ask` with a missing `GEMINI_API_KEY`, for example), and `curl /api/observability/captures` to see the structured capture.
- When a real Sentry DSN is attached, both backends run in parallel — the in-memory ring stays useful as a local tail, and Sentry gets the long-term store.
- Zero extra work for the portfolio's "free tier, no CC required" invariant. The guide in `docs/FREE_TIER_ONBOARDING.md` can honestly tell a reviewer "you do not need to sign up for Sentry to see this wired".
- The seam absorbs future backend swaps (Better Stack, Axiom, self-hosted) without touching callsites.

Negative:

- Two copies of `observability.ts` to keep in sync; same trade-off as `kb-rate-limit.ts` / `global-budget.ts`. Small, isolated, high-read-low-write modules: cheaper to duplicate than to factor.
- The ring is per-process. On Vercel serverless this means a capture fired from one container is not visible from another. Acceptable for a demo; a production observability layer would push to a shared store.
- `ENABLE_OBSERVABILITY_API=1` on the live deploy would leak server-side error strings to the internet. Production default is closed; operators have to opt in explicitly. Documented in the route handler and in the onboarding guide.

## Follow-ups

- When `SENTRY_AUTH_TOKEN` is wired into CI secrets (ADR-0044 follow-up), promote the seam to also call `Sentry.captureMessage` for the interesting success paths (deploy health, ivfflat-would-have-returned-0 assertions, etc.) so Sentry becomes a positive signal stream, not just a failure sink.
- Add a "Recent errors" row to the stats response at `/api/kb/stats` — `{ recentCaptureCount, recentCaptureBackend }` — so the live smoke workflow can assert `recentCaptureBackend === "memory"` in demo deployments and `"sentry"` when the operator has wired it. Makes the configuration state externally observable.
- Extend the eval `scripts/eval.ts` to call `captureError` on failed assertions so a golden-set regression shows up in the observability tail.
