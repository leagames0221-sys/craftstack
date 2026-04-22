# ADR-0004: Socket.IO + Redis Adapter for realtime

- Status: Accepted
- Date: 2026-04-22
- Tags: realtime, websocket

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
