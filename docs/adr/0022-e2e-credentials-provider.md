# ADR-0022: E2E-only credentials provider

- Status: Accepted
- Date: 2026-04-22
- Tags: testing, auth

## Context

Auth.js redirects the browser to the real OAuth provider. Playwright + MSW cannot intercept that cross-origin redirect reliably, and pointing at real Google/GitHub in CI is a moving target.

## Decision

Conditionally register an Auth.js `Credentials` provider only when `NODE_ENV === 'test'` (or an explicit `AUTH_TEST_PROVIDER=1` flag). Playwright POSTs email+password to `/api/auth/signin/credentials` to obtain a session cookie. Production bundles tree-shake the provider out because `NODE_ENV` is `production` at build time.

## Consequences

Positive:

- E2E test suite runs without hitting OAuth providers
- Deterministic, fast login path for Playwright
- Zero attack surface in production — provider does not exist in the bundle

Negative:

- One more branch in the auth config; guarded by environment
