# ADR-0009: Vercel + Fly.io hybrid deploy

- Status: Accepted
- Date: 2026-04-22
- Tags: hosting, deploy

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
