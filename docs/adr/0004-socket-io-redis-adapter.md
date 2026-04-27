# ADR-0004: Socket.IO + Redis Adapter for realtime

- Status: **Partially superseded by [ADR-0052](0052-pusher-pivot-from-flyio-socketio.md) (2026-04-28)** — original Accepted earlier; the Boardly realtime portion pivoted to Pusher Channels. The "rejected: Ably/Pusher — forces future vendor cost" alternative below was reversed by [ADR-0046](0046-zero-cost-by-construction.md) (Pusher Sandbox is hard-capped at $0).
- Date: 2026-04-22
- Tags: realtime, websocket

> **Supersession note**: this ADR's realtime decision was superseded by [ADR-0052](0052-pusher-pivot-from-flyio-socketio.md). Pusher Channels (Sandbox tier) is the shipped realtime fanout for Boardly. The Redis Pub/Sub component intent (ADR-0005) remains valid for future architectural extensions but is not currently exercised — Boardly only uses Upstash Redis for `@upstash/ratelimit`. Decision content below is preserved as historical record.

## Context

Boardly needs simultaneous editing, presence, and shared cursors across multiple clients and multiple server instances. Native WebSocket offers no rooms, reconnection, or horizontal scale primitives out of the box.

## Decision

Use Socket.IO with `@socket.io/redis-adapter` (Upstash free tier for dev). Namespace `/boards`, room per `boardId`. Handshake authenticates via the Auth.js session cookie.

## Consequences

Positive:

- Auto-reconnect, rooms, namespaces built in
- Redis Pub/Sub glue enables horizontal scale on Fly.io
- Session cookie reuse keeps auth consistent with the HTTP layer

Negative:

- ~6KB gzip client bundle overhead
- Protocol is not plain WebSocket; some edge proxies need tuning

## Alternatives

- Native WebSocket: rejected — too much reinvention for rooms/reconnect
- Ably/Pusher: rejected — forces future vendor cost
- Liveblocks/PartyKit: rejected — reduces the built-from-scratch portfolio value
