# ADR-0009: Vercel + Fly.io hybrid deploy

- Status: **Superseded by [ADR-0052](0052-pusher-pivot-from-flyio-socketio.md) (2026-04-28)** — original Accepted 2026-04-22; never deployed
- Date: 2026-04-22
- Tags: hosting, deploy

> **Supersession note**: this ADR was Accepted 2026-04-22 but never deployed. During Boardly v0.1.0 implementation the realtime portion moved to Pusher Channels (ADR-0052), and the BullMQ worker was dropped (Knowlex's bounded corpus does not need an async ingest pipeline). The decision content below is preserved as historical record of the design-phase plan; the **shipped architecture is documented in [ADR-0052](0052-pusher-pivot-from-flyio-socketio.md)** which records the implementation-time pivot rationale.

## Context

Next.js SSR/ISR fits the Vercel edge model. Socket.IO and BullMQ workers need long-lived processes, which Vercel intentionally does not run.

## Decision

Deploy Next.js SSR + Route Handlers to Vercel Hobby. Deploy the Socket.IO server (Boardly) and BullMQ worker (Knowlex) to Fly.io shared-cpu-1x. Cloudflare fronts DNS for both.

## Consequences

Positive:

- Each platform plays to its strength
- All free tiers
- Clear scale path: Vercel Pro first, then Fly dedicated-cpu

Negative:

- Two deploy pipelines to maintain
- CORS must be explicit between origins

## Alternatives

- Vercel only: rejected — no persistent WebSocket host
- Fly only: rejected — weaker SSR cache and DX
- Render: rejected — free tier cold-starts are rough
