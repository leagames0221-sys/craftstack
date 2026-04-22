# ADR-0007: Optimistic locking via version column

- Status: Accepted
- Date: 2026-04-22
- Tags: concurrency, realtime

## Context

Over WebSocket, two clients can submit edits within milliseconds. Pessimistic locks leak when clients disconnect and hurt the UX with explicit "taken" states.

## Decision

`Card` carries a `version` integer. PATCH requests must send the version they last saw; the server bumps it atomically and returns 409 on mismatch. The client then re-fetches and presents a merge UI.

## Consequences

Positive:

- No lock lifecycle to manage
- 409 rate becomes a direct metric of conflict frequency
- Natural fit with broadcast — conflicting clients both see the new version

Negative:

- Merge UI implementation cost
- Long-form editing (descriptions) sees more conflicts; CRDT is a future option

## Alternatives

- Pessimistic lock: rejected — socket disconnect leaks
- CRDT (Yjs): deferred — schema complexity not justified in v1
