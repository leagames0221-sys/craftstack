# ADR-0003: Auth.js v5 + database session strategy

- Status: Accepted
- Date: 2026-04-22
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
