# ADR-0052: Pusher Channels chosen over Fly.io + Socket.IO — implementation-time pivot from ADR-0009 + ADR-0004

- Status: Accepted
- Date: 2026-04-28
- Tags: realtime, hosting, deploy, governance, supersession
- Supersedes: [ADR-0009](0009-vercel-flyio-hybrid.md) (Vercel + Fly.io hybrid deploy), partially [ADR-0004](0004-socket-io-redis-adapter.md) (Socket.IO + Redis Adapter for realtime)

## Context

ADR-0009 (Accepted 2026-04-22) committed to a Vercel + Fly.io hybrid deploy: Next.js SSR/Route Handlers on Vercel, the Boardly Socket.IO server + Knowlex BullMQ worker on Fly.io shared-cpu-1x. ADR-0004 (Accepted earlier) chose Socket.IO + `@socket.io/redis-adapter` and explicitly **rejected** Pusher with the reason "forces future vendor cost".

During Boardly v0.1.0 implementation (commit `a7af618` "feat(collab): card drag-and-drop + Pusher realtime fanout") the plan changed: realtime fanout was implemented against **Pusher Channels (Sandbox tier)**, not against a self-hosted Socket.IO server on Fly.io. The BullMQ worker was also dropped — Knowlex's bounded corpus does not need an async ingest pipeline at this scale. Fly.io was therefore not deployed at all.

This pivot was **never recorded as an ADR**. It propagated implicitly through code (`apps/collab/src/lib/pusher.ts`, `BoardClient` Pusher subscription, env-guarded fallback) and CHANGELOG entries (v0.4.x mentions Pusher), but the upstream ADRs (0004, 0009) and several downstream docs (`portfolio-lp.md`, `interview-qa.md`, `system-overview.md`, `SECURITY.md`, `CONTRIBUTING.md`, `infra/k6/board-load.js`, the GitHub About sidebar) continued to describe the original Fly.io + Socket.IO architecture. The drift was caught by the v0.5.3-prep audit-survivability sweep (this PR + companions).

This ADR retroactively records the pivot rationale and supersedes ADR-0009 + the realtime portion of ADR-0004 so the doc surface aligns with the implementation.

## Decision

**Use Pusher Channels Sandbox for Boardly realtime fanout. Deploy only to Vercel (no Fly.io). Drop the BullMQ worker entirely.**

Concretely:

- Boardly realtime: `pusher` server SDK in Route Handlers emits to channel `board-<id>`; clients subscribe via `pusher-js` from `BoardClient`. No self-hosted WebSocket server.
- Knowlex ingest: synchronous request-response via `/api/kb/ingest`; no async worker. Bounded corpus + per-IP / global budget limiter handle the throughput envelope.
- Deploy: two Vercel projects (`craftstack-collab`, `craftstack-knowledge`), one CI pipeline. No second platform to authenticate, monitor, or pay.

## Rationale

Three reinforcing reasons drove the implementation choice:

### 1. [ADR-0046](0046-zero-cost-by-construction.md) (zero-cost-by-construction) compatibility

ADR-0046 was Accepted **after** ADR-0009 and codifies a stricter cost stance than ADR-0009 anticipated: every external service must hard-cap at $0 with no auto-billing path. Fly.io free tier (`shared-cpu-1x`) is free at rest but auto-suspends when idle and requires either a wake-up `fly machine start` call or paid always-on billing to remove the cold-start. Either branch adds operational state.

Pusher Channels Sandbox: 200k msg/day + 100 concurrent connections, free, no card on file, hard-cap at the quota with HTTP 429. No auto-billing, no wake-up logic, no operational state. Fits ADR-0046 cleanly. ADR-0004's original "Ably/Pusher: rejected — forces future vendor cost" judgement was correct for the pre-ADR-0046 cost stance; ADR-0046 invalidated that premise.

### 2. Single-pipeline simplicity for a solo developer

ADR-0009 listed "Two deploy pipelines to maintain" as a Negative Consequence and accepted it. In implementation, the cost showed up as: a second platform's deploy hooks to wire, separate observability surface (Fly's `fly logs` vs. Vercel's dashboard), separate secrets store, separate CI integration. For a solo developer with [ADR-0017](0017-release-order.md) "ship Boardly first" pressure, the second pipeline was overhead with no compensating product value.

Pusher = HTTP API call from Vercel's existing Node runtime. No second pipeline. No second observability surface.

### 3. Env-guarded degradation pattern fit ([ADR-0030](0030-best-effort-side-effects.md), [ADR-0032](0032-mention-resolution-and-env-guarded-integrations.md))

The repo-wide pattern is: every external integration is env-guarded, and missing credentials produce a graceful no-op so contributors can boot the app end-to-end without signing up for anything. This fits Pusher cleanly: no `PUSHER_*` env vars → the broadcast call is a console-warned skip, the app keeps working (clients just don't see live updates from peers, board state still mutates correctly).

Self-hosted Socket.IO has the inverse shape: the server has to be running for clients to connect; if it's down, attempted handshakes hang or fail visibly. Env-guarding "the entire WebSocket server is dormant" is a different pattern than env-guarding "skip a single HTTP call". The latter is mechanical; the former requires server-side status routing.

## Consequences

### Positive

- ADR-0046 mandate honoured without operational gymnastics
- Single Vercel pipeline; CI / observability / secrets all in one place
- Env-guarded degradation matches the rest of the repo's pattern uniformly
- Zero recurring cost; no credit card on file at any vendor
- Pusher Sandbox quota (200k msg/day) is plenty for a portfolio demo's traffic

### Negative

- Vendor lock to Pusher's API surface (mitigated: realtime emit lives in one `apps/collab/src/lib/pusher.ts` module — swapping is a module rewrite, not a system rewrite)
- 100 concurrent connection cap on Sandbox would constrain a hypothetical scale ceiling (not reached at portfolio demo scale; upgrade path is Pusher Startup at $49/mo, deliberate operator choice)
- The original load-test scaffold `infra/k6/board-load.js` was authored against a `ws://.../boards` Socket.IO endpoint that no longer exists. Marked DEPRECATED in-file with a v0.6.0 rewrite roadmap (Pusher-aware load harness, HTTP-fanout latency)

### Doc-drift surface cleared in this PR

The pivot's drift had propagated to (all corrected in this PR or its companions):

- About sidebar (Fly.io listed as deploy target) → corrected to "Vercel" + Pusher
- `portfolio-lp.md` (Boardly described as "Socket.IO + Fly.io"; tech stack listed Fly.io and Cohere) → full rewrite to v0.5.2 reality
- `interview-qa.md` Q2/Q5/Q11/Q13/Q15/Q16/Q17/Q18/Q20/Q23/Q26 (described Fly.io + WebSocket + hybrid + RLS as if shipped) → rewritten against actual implementation, design-phase ambitions explicitly marked as deferred per ADR-0039
- `docs/architecture/system-overview.md` (Mermaid + capacity table both showed Fly.io + Socket.IO + BullMQ + Cohere) → replaced with the README's accurate diagram + a "what is not in this diagram" section
- `docs/compliance/data-retention.md` ("BullMQ repeatable job at 03:00 JST" + "Fly.io NRT region") → corrected to "automated cleanup not yet shipped, Vercel Cron on v0.6.0 roadmap" + "Vercel edge / Neon Singapore"
- `SECURITY.md` ("Any future Fly.io machine once realtime ships") → corrected to current scope (Vercel deploys + Pusher integration)
- `CONTRIBUTING.md` ("Vercel and Fly.io dashboards") → corrected to Vercel-only
- `infra/k6/board-load.js` (k6 against Socket.IO `ws://`) → DEPRECATED banner with v0.6.0 Pusher-aware rewrite roadmap

## Alternatives considered (at implementation time)

- **Stay with ADR-0009 (Vercel + Fly.io hybrid as planned)** — rejected per the three Rationale reasons above
- **Ably** — rejected for the same ADR-0004 vendor-cost reason that originally rejected Pusher; ADR-0046 invalidation applies symmetrically, but Pusher had a cleaner free-tier story at the time of choice
- **Native WebSocket on Vercel** — Vercel's serverless runtime cannot hold long-lived connections; ruled out by platform
- **Server-Sent Events (SSE)** — one-way only; would not support the multi-client `board-<id>` fanout shape
- **Polling** — rejected for UX (latency + bandwidth waste)

## Audit-survivability note

This ADR exists because the pivot **wasn't recorded promptly**. The instructive failure isn't the technical choice (Pusher is fine); it's that the doc surface drifted for ~6 weeks because no ADR captured the supersession at the moment it happened. The v0.5.4 doc-drift-detect CI gate (extending [ADR-0051](0051-prisma-migrate-on-vercel-build.md) drift-detect-v2 from schema to documentation) is the institutional fix: a CI assertion that every ADR Status referenced from prose either matches the implementation or is explicitly Superseded. Until that gate ships, the manual ratchet is the v0.5.3-prep audit-survivability sweep recorded across PRs #33, #34, #35.

## References

- [ADR-0004](0004-socket-io-redis-adapter.md) — Socket.IO + Redis Adapter (partially superseded by this ADR; Boardly realtime portion only)
- [ADR-0009](0009-vercel-flyio-hybrid.md) — Vercel + Fly.io hybrid deploy (superseded by this ADR)
- [ADR-0017](0017-release-order.md) — Boardly-first release order (the solo-dev pressure that motivated rejecting the second pipeline)
- [ADR-0030](0030-best-effort-side-effects.md) — best-effort side-effect pattern that Pusher fits naturally
- [ADR-0032](0032-mention-resolution-and-env-guarded-integrations.md) — env-guarded integration pattern
- [ADR-0039](0039-knowlex-mvp-scope.md) — MVP scope deferring hybrid/HyDE/Faithfulness/RLS/BullMQ
- [ADR-0046](0046-zero-cost-by-construction.md) — zero-cost-by-construction; the rule that invalidated ADR-0004's anti-Pusher rationale
- [ADR-0051](0051-prisma-migrate-on-vercel-build.md) — drift-detect-v2 schema gate; the precedent for a future doc-drift-detect gate
