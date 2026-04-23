# ADR-0027: Three-layer rate limit on invitation creation

- Status: Accepted
- Date: 2026-04-23
- Tags: security, rate-limit, abuse

## Context

Invitation creation is one of the most abusable endpoints in any multi-tenant SaaS: it triggers outbound email (Resend cost + sender-reputation risk), it's reachable by any admin (a single compromised admin could blast thousands of invites), and a naive global limit either lets an individual user burn the entire quota or lets a zombie workspace starve everyone else.

## Decision

Enforce three independent counters on every invitation creation:

1. **Global**: 1000 invitations per month (Resend free-tier guardrail).
2. **Per-workspace**: 50 invitations per day (stops a single compromised admin).
3. **Per-user**: 20 invitations per day (stops a noisy neighbor).

Counts include revoked and accepted rows so an attacker cannot reset quota by revoking. All three limits are env-override-able. Trips return 429 with a specific error code (`LIMIT_GLOBAL_EXCEEDED`, `LIMIT_WORKSPACE_EXCEEDED`, `LIMIT_USER_EXCEEDED`) so the UI can tell the user _which_ quota fired.

## Consequences

Positive:

- Defense in depth: an attacker must bypass all three to exfiltrate spam volume.
- Operators can tune per deployment without a code change.
- UI explains the failure precisely (better than generic "try again later").

Negative:

- Three counters means three extra queries per creation. Acceptable because invitation creation is rare.
- Env-override-ability is a footgun in production if misconfigured; we document the defaults in the README.

## Alternatives Considered

- **Single global rate limit** — rejected; starvation scenarios are too easy.
- **Per-user-only limit** — rejected; doesn't protect against a compromised admin scenario.
- **IP-based rate limit** — rejected; trivial to bypass in authenticated flows, and users behind NAT collide.
