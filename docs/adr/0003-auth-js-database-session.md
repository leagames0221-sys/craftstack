# ADR-0003: Auth.js v5 + database session strategy

- Status: **Superseded by JWT strategy in practice** — implementation switched to Auth.js v5 JWT sessions to unblock the Vercel Edge Runtime proxy (see `fix(auth)` commit in git history; the database-session strategy this ADR specified did not ship). The narrative-level supersession is recorded in `docs/adr/README.md` § "Supersession notice" (line 8). A formal numbered closing ADR was originally planned as ADR-0023 but ADR-0023 ended up scoped to 4-tier RBAC (different topic); the supersession remains documented in prose-form only. Status updated v0.5.19 / [ADR-0069](0069-run6-findings-closure-and-page-surface-coverage.md) § Finding D4 — prior bare "Accepted" contradicted README's own supersession notice + interview-qa Q10.
- Date: 2026-04-22 (originally) / 2026-04-29 (Status updated post-Run-#6)
- Tags: auth, session

## Context

OAuth with Google and GitHub is required. Invitation flows, role changes, and immediate sign-out must all revoke access server-side without waiting for a JWT to expire.

## Decision

Adopt Auth.js v5 with the Prisma adapter and `session.strategy = 'database'`. Every request validates its session row, so revocation is O(1) at the database.

## Consequences

Positive:

- Server can kill any session instantly by deleting the row
- Per-device session rows make concurrent-login management trivial
- No JWT tampering surface

Negative:

- One DB lookup per authenticated request; mitigated by a Redis session cache later
- Slightly more complex than JWT-only for truly stateless edges

## Alternatives

- JWT session: rejected — no server-side revocation
- Custom auth: rejected — audit and maintenance risk
