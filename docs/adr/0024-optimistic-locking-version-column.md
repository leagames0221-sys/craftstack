# ADR-0024: Optimistic locking via `version` column on Card

- Status: Accepted (implements the pattern proposed in [ADR-0007](0007-optimistic-locking.md))
- Date: 2026-04-23
- Tags: concurrency, realtime, api

## Context

Multiple editors routinely work on the same board simultaneously. The most common collision is concurrent card moves (two users dragging the same card). A pessimistic `SELECT FOR UPDATE` in a long HTTP request would serialize throughput badly and still not prevent the older lost-update problem. We needed a cheap, low-latency way to reject stale writes while letting the client-side optimistic UI stay fast.

## Decision

Carry an integer `version` column on `Card`. Every mutating route accepts `expectedVersion` from the client; the server executes `updateMany({ where: { id, version: expectedVersion }, data: { version: { increment: 1 } } })`. Zero rows affected → 409 `VERSION_MISMATCH`. On success, the client bumps its local mirror so rapid drags chain cleanly without self-conflicts.

## Consequences

Positive:

- One round-trip to detect the conflict; no advisory locks or long-held transactions.
- Client-side optimistic UI is preserved — stale writes are the exception, not the path.
- Trivial to reason about: the atomic test is a single SQL predicate.

Negative:

- The client must thread `expectedVersion` through every mutation (drag, edit, label change). We centralized this in the board client state to avoid scattering the knowledge.
- Rapid-retry logic has to be explicit; we chose to surface the 409 to the user ("card was updated elsewhere, reload") rather than silently retry and potentially compound the confusion.

## Alternatives Considered

- **Pessimistic `SELECT FOR UPDATE`** — rejected; increases tail latency and complicates Prisma usage.
- **Last-write-wins** — rejected; produces silent data loss in the drag-conflict case.
- **CRDT / operational transform** — rejected as disproportionate for a kanban (LexoRank + version is cheap and the collision surface is small).
