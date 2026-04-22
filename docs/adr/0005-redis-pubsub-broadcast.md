# ADR-0005: Redis Pub/Sub for broadcast synchronization

- Status: Accepted
- Date: 2026-04-22
- Tags: realtime, scalability

## Context

Running multiple Socket.IO instances requires an inter-process broadcast bus so every client in the same room sees the same events regardless of which node received them.

## Decision

Use Upstash Redis Pub/Sub through `@socket.io/redis-adapter`. The same Redis instance also backs `@upstash/ratelimit` for request quotas.

## Consequences

Positive:

- Zero-config horizontal scale on Fly.io
- Free tier (10,000 cmd/day) is sufficient for dev
- Single Redis handles both broadcast and rate limiting

Negative:

- Redis outage breaks cross-instance broadcast; mitigated by single-instance fallback
- Free-tier command ceiling requires disciplined heartbeat intervals (see ADR-0016)

## Alternatives

- NATS: rejected — extra operational surface
- Postgres LISTEN/NOTIFY: rejected — 8KB payload cap
