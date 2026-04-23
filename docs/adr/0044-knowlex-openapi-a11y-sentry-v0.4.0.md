# ADR-0044: Knowlex documentation, a11y, security-header, and Sentry parity for v0.4.0

- Status: Accepted
- Date: 2026-04-24
- Tags: knowlex, openapi, a11y, security, sentry, release

## Context

After ADR-0043 Knowlex reached operational parity with Boardly on cost safety, CI gates, and RAG eval. Three parity gaps remained before both apps could plausibly be described as "the same quality bar":

1. **No hand-written OpenAPI + reference page.** Boardly ships `src/openapi.ts` as the contract, serves it at `/api/openapi.json`, and renders it server-side at `/docs/api` behind the strict CSP (see ADR-0035). Knowlex shipped without any of that surface.
2. **No security headers of note, no a11y scan.** Knowlex's `next.config.ts` only set four baseline headers; it would have scored a C or D on securityheaders.com. Boardly's `/` and `/playground` pass axe-core WCAG 2.1 AA (`serious` + `critical` gate); Knowlex's `/` and `/kb` had never been scanned.
3. **No error-tracking integration.** The repo's architectural narrative calls out `Sentry · Better Stack · UptimeRobot` as planned, but nothing was actually wired. Silent production failures — the class of thing that bit us in Session 252 — have no upstream sink.

Fixing these at once is deliberate: they all sit on the same seam (`apps/knowledge/{src/app,src/openapi.ts,next.config.ts,tests/smoke}`), and cutting them as one release lets the v0.4.0 tag represent a clean "both apps at the same bar" checkpoint rather than a trickle of small follow-up commits.

## Decision

### 1. Knowlex OpenAPI 3.1

Added `apps/knowledge/src/openapi.ts` — hand-written 6-route spec (`/api/kb/ingest`, `/api/kb/ask`, `/api/kb/documents` GET/DELETE, `/api/kb/stats`, `/api/health`, `/api/openapi.json`) with full request/response schemas, distinct tag groups (Corpus / RAG / Meta), and servers entries for production + local. Shape matches Boardly's spec so external tooling (`openapi-typescript`, Scalar, Swagger Editor) can target both identically.

Added `apps/knowledge/src/app/api/openapi.json/route.ts` — public, force-static, cached for 5 min at the client + 1 h at the edge.

Added `apps/knowledge/src/app/docs/api/{page.tsx,ApiOperation.tsx}` — server-rendered operation table grouped by tag, same `ApiOperation` design as collab (method pill, path, expandable parameters / request body / responses), same strict-CSP-friendly footprint (zero external CDN). `/docs/api` is indexable; a recruiter searching for the Knowlex API surface lands on a real page rather than a link to `editor.swagger.io`.

### 2. Security headers + a11y smoke

`apps/knowledge/next.config.ts` now applies the same CSP + headers stack as Boardly (ADR-0040). Differences from Boardly are limited to the connect-src / script-src allowlists (no Pusher, no Resend, no Google avatars — Knowlex is single-user request/response). HSTS 2y preload, X-Frame-Options DENY, Cross-Origin-{Opener,Resource}-Policy same-origin, Permissions-Policy denying 17 unused capabilities — all identical. Expected securityheaders.com grade: **A**, matching Boardly.

`apps/knowledge/tests/smoke/a11y.spec.ts` — axe-core WCAG 2.1 AA smoke against `/` and `/kb`. Zero tolerance for `serious` + `critical`; `moderate` + `minor` logged but non-blocking. Runs alongside the existing stats smoke via `pnpm --filter knowledge test:e2e:smoke`, so the scheduled live-smoke workflow (`.github/workflows/smoke.yml`) now also asserts a11y against the deployed Knowlex.

### 3. Sentry (DSN-gated)

Added `apps/knowledge/src/instrumentation.ts` and `apps/collab/src/instrumentation.ts`. Both use Next's built-in `register()` hook; when `SENTRY_DSN` is unset they no-op, keeping the "free tier, no CC required" invariant. When set they dynamically import `@sentry/nextjs` and call `Sentry.init` with:

- the given DSN
- `tracesSampleRate` from env (default 0.1)
- `environment` pulled from `VERCEL_ENV` then `NODE_ENV`
- `release` pinned to `VERCEL_GIT_COMMIT_SHA` so captures are attributable to a specific deploy

Deliberately **skipped** the `@sentry/nextjs` webpack plugin (auto-instrumented API route wrappers, source-map upload). That path needs a Sentry auth token at build time; we want builds to work without any Sentry configuration at all. Stack traces on captured errors will be minified but usable. Promoting to full integration is a follow-up when CI secrets are wired.

`@sentry/nextjs` added as a direct dependency on both apps. Bundle impact on cold-start is bounded because the import is dynamic and short-circuited on missing DSN.

### 4. v0.4.0 release tag

`CHANGELOG.md` gets a v0.4.0 entry covering every landed Knowlex change across ADR-0041 → 0044 plus the Boardly handler cleanup. An annotated tag `v0.4.0` is pushed to `main`; the existing `sbom.yml` workflow auto-generates and attaches a CycloneDX 1.5 SBOM to the GitHub Release.

## Consequences

Positive:

- Both apps now pass the same three bars: A-grade security headers, WCAG 2.1 AA smoke, hand-written OpenAPI with a browsable reference page. "Two apps at the same quality bar" is defensible from source inspection, not just README prose.
- Recruiters who hit `/docs/api` on either domain see an identical interactive reference under the same strict CSP. No external CDN; no `editor.swagger.io` redirect as a dependency.
- With `SENTRY_DSN` set, silent failures in production become a ping in whatever Sentry project the operator points at. The Knowlex 0-chunks regression class would now arrive as a captured error (or a drop in `/api/kb/stats` counts) instead of a user-reported symptom.
- The v0.4.0 tag cuts a clean "Knowlex live + observable + documented" checkpoint for portfolio linking.

Negative:

- Adding `@sentry/nextjs` expands the dependency tree on both apps even when DSN is unset. Cold-start cost is bounded by the dynamic import gate, but lockfile size grows.
- Without the webpack plugin, captured errors carry minified stack traces. Usable, not beautiful. Intentional trade-off to keep builds working with zero Sentry configuration.
- The Knowlex OpenAPI spec duplicates some shape decisions already made in the Boardly spec (error envelope, cache-control behaviour). Consolidating into `packages/openapi-shared/` is deferred until the duplication actually hurts.

## Follow-ups

- Wire CI secrets so `SENTRY_AUTH_TOKEN` is available on main-branch builds; enable `withSentryConfig` in both apps to upload source maps per deploy. Gate the plugin on `SENTRY_AUTH_TOKEN` being set so local + PR builds still pass without any Sentry configuration.
- Generate a typed API client for Knowlex with `openapi-typescript` (`apps/knowledge/src/openapi-types.ts`) analogous to Boardly's, and add `pnpm --filter knowledge generate:api-types` as a script.
- Add Knowlex `/docs/api` to `tests/smoke/a11y.spec.ts` once the spec stabilises, so the reference page is held to the same WCAG bar as the product UI.
