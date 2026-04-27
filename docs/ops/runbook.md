# Runbook

> **Status (as of v0.5.2)**: this runbook covers the **deployed** architecture (Vercel + Pusher Channels + Neon + Upstash + Gemini). The original ADR-0009 plan included Fly.io + self-hosted Socket.IO + BullMQ; that pivot to Pusher is recorded in [ADR-0052](../adr/0052-pusher-pivot-from-flyio-socketio.md), and any prior Fly.io-specific procedures (`flyctl status`, Fly machine restart, BullMQ dead-letter queue) are not applicable here. Incident response runs through Vercel + Pusher + Neon dashboards.

Incident playbook for production services. Every section follows the same shape:
**Symptoms → Triage → Mitigation → Root cause follow-up.**

## Table of contents

1. [Neon Postgres down](#1-neon-postgres-down)
2. [Upstash Redis down (rate-limit only)](#2-upstash-redis-down-rate-limit-only)
3. [Pusher Channels degraded](#3-pusher-channels-degraded)
4. [Gemini rate limit exhausted](#4-gemini-rate-limit-exhausted)
5. [Vercel deploy / build failure](#5-vercel-deploy--build-failure)
6. [High latency at the edge](#6-high-latency-at-the-edge)
7. [Data corruption recovery](#7-data-corruption-recovery)
8. [Incident report template](#8-incident-report-template)
9. [Emergency stop (`EMERGENCY_STOP=1`)](#9-emergency-stop-emergency_stop1)

---

## 1. Neon Postgres down

**Symptoms**

- `/api/me` returns 500
- Sentry: burst of `PrismaClientInitializationError`
- UptimeRobot health check flaps

**Triage**

1. Neon console → project status (`boardly-db` and/or `knowlex-db`)
2. `psql $DIRECT_DATABASE_URL -c "SELECT 1"` from a local shell (use the Neon project that's flagging)
3. Read the start-of-incident timestamp from UptimeRobot
4. Confirm via live probe: `curl -sS https://craftstack-knowledge.vercel.app/api/kb/stats` returning a JSON body indicates Knowlex DB is reachable; an HTTP 5xx indicates the outage

**Mitigation**

- Flip `READ_ONLY=1` in the affected Vercel project (`craftstack-collab` or `craftstack-knowledge`) → Settings → Environment Variables → Production → Save → Deployments → Redeploy current build. App will respond to reads from cached sessions; every mutation returns `{ code: "READ_ONLY" }` with HTTP 503.
- Once Neon recovers, unset `READ_ONLY` and redeploy.

**Root cause follow-up**

- If Neon auto-suspend triggered, verify UptimeRobot is pinging within the 5-minute idle window (ADR-0016).
- If monthly compute hours exceeded, schedule Neon Pro upgrade (deliberate operator decision; v0.5.2 is at $0/mo per ADR-0046).
- If schema-vs-prod drift is suspected (the `Document.workspaceId does not exist` class of failure), confirm `_prisma_migrations` table has the latest migration applied and consult ADR-0051 for the `vercel-build` migration regime that prevents re-occurrence.

---

## 2. Upstash Redis down (rate-limit only)

**Symptoms**

- `/api/cards/:id/move` and other rate-limited routes log `@upstash/ratelimit` errors
- 429 responses become unpredictable (over-permissive or over-restrictive depending on the failure mode)

**Note on scope**: per ADR-0052 Boardly realtime fanout uses Pusher Channels, **not** Socket.IO + Redis Pub/Sub. An Upstash outage therefore does **not** affect realtime broadcasts; it only affects rate limiting and any helper paths that read from Redis.

**Mitigation**

- `@upstash/ratelimit` has a built-in `Ratelimit.fixedWindow` ephemeral fallback when the Redis connection fails — verify it kicked in by checking the warn-level log line `ratelimit: redis unreachable, falling back to in-memory`.
- If sustained > 30 min: open a Vercel env override toggling rate limits to a more permissive in-memory window for the duration.
- Pusher Channels traffic is unaffected; do not take any action against Pusher.

**Root cause follow-up**

- Check Upstash dashboard for the outage window + commands/sec graph.
- If the free-tier 10k cmd/day cap was hit, ADR-0046 § Trade-offs documents the upgrade decision criteria.

---

## 3. Pusher Channels degraded

**Symptoms**

- Boardly clients on different browsers stop seeing each other's card moves in realtime (own mutations still apply locally)
- Sentry: `pusher` SDK errors, or HTTP errors when the server emits to Pusher

**Triage**

1. Pusher dashboard → app `craftstack-collab` → status
2. Live probe: open Boardly in two browser tabs, move a card in tab A, expect tab B to reflect the move within ~1s; if not, fanout is degraded
3. Check `apps/collab/src/lib/pusher.ts` env-guard: missing `PUSHER_*` envs cause silent skip per ADR-0030/0032

**Mitigation**

- Pusher emit is wrapped per ADR-0030 — the originating card save **does not fail** even if Pusher is down. Users still get their own writes saved; they just don't see peers' writes until refresh.
- If the outage is at Pusher's side: nothing to do but wait. Optionally surface a "live updates paused" toast.
- If credentials were rotated incorrectly: re-set `PUSHER_*` envs in Vercel, redeploy.

**Root cause follow-up**

- Sandbox tier free quota: 200k msg/day, 100 concurrent connections per ADR-0052. If the cap was hit, the upgrade path is Pusher Startup ($49/mo) — explicit operator decision.

---

## 4. Gemini rate limit exhausted

**Symptoms**

- `/api/kb/ask` returns 429 mid-stream or short-circuits with `RATE_LIMIT_EXCEEDED`

**Mitigation**

- The eval client retry contract per ADR-0049 absorbs transient 429 with `Retry-After` honoured up to 90s cap.
- For sustained exhaustion: surface a toast "Service is temporarily busy — please retry shortly" — the route returns a structured `{ code, retryAfter }` body matching OpenAPI schema per ADR-0035.
- Confirm AI Studio quota reset time at `https://aistudio.google.com`.

**Root cause follow-up**

- If hit by abuse rather than legitimate traffic: reach for `EMERGENCY_STOP=1` (§9) before rotating the key.
- The `/api/kb/budget` observability endpoint (gated on `ENABLE_OBSERVABILITY_API=1`) shows current usage vs day/month caps.

---

## 5. Vercel deploy / build failure

**Symptoms**

- `vercel-build` script fails (most commonly `prisma migrate deploy` errors per ADR-0051)
- Production deploy stays on the previous build (Vercel preserves the last successful deploy automatically — no user-visible outage from a failed build)

**Triage**

1. Vercel dashboard → project → Deployments → click the failed deploy → Build Logs
2. If the error is `migrate deploy` related: check `_prisma_migrations` table state vs `apps/{app}/prisma/migrations/` files
3. Check `drift-detect-v2` PR-time gate output (ADR-0051) to see if the migration was caught pre-merge

**Mitigation**

- Forward-only fix: write a new migration that resolves the discrepancy, push, let `vercel-build` re-run.
- Never modify a previously-applied migration — Prisma's `_prisma_migrations` table will reject the rerun.
- If the failure is a real schema-vs-prod conflict, consult ADR-0051 for the expand → backfill → contract pattern.

**Root cause follow-up**

- Did `pg_catalog` drift-detect-v2 pass on the PR? If yes but build failed, the gate has a gap — open an issue with the diff.
- Did Vercel preview build run `migrate deploy`? Per ADR-0051 § Q1, Vercel preview shares the production DB by default. v0.5.4 wires Vercel-Neon integration to isolate preview branches.

---

## 6. High latency at the edge

**Triage order**

1. Vercel → Analytics → p95 by route
2. Neon → Slow Queries tab (`knowlex-db` for RAG paths, `boardly-db` for kanban paths)
3. Upstash → Commands/sec graph (rate-limit overhead)
4. For Knowlex: check `docs/eval/reports/YYYY-MM-DD.json` for the most recent measured `p95Ms` and `passRate` from the nightly cron

---

## 7. Data corruption recovery

**Procedure**

1. Stop writes (`READ_ONLY=1` per §1)
2. Restore from Neon PITR to a shadow project (Free: 7-day window, Pro: 30-day per ADR-0016)
3. Compare checksums of affected tables against the shadow restore
4. Forward-only correction migration; never rewrite migration history

---

## 8. Incident report template

```markdown
# Incident <YYYY-MM-DD>: <one-line headline>

**Severity**: SEV1 | SEV2 | SEV3
**Impact start**: YYYY-MM-DD HH:MM UTC
**Impact end**: YYYY-MM-DD HH:MM UTC
**Affected**: <apps / endpoints / user %>

## Timeline

- HH:MM — detection
- HH:MM — triage
- HH:MM — mitigation applied
- HH:MM — verified resolved

## Root cause

<one paragraph>

## What went well

- ...

## What did not

- ...

## Action items

- [ ] owner · deadline · task

## ADR follow-up

- [ ] If this incident exposes a missing structural defence, draft an ADR-NNNN (the audit-survivability stance from ADR-0046 + the incident-driven ratchet log of ADR-0049/0050/0051/0052 is the precedent)
```

---

## 9. Emergency stop (`EMERGENCY_STOP=1`)

The nuclear option _for Gemini-consuming routes specifically_. Setting
`EMERGENCY_STOP=1` in a deployment's env disables `/api/kb/ask` +
`/api/kb/ingest` (knowledge) and `/api/kb/ask` (collab playground) on
the next request; read-only observability endpoints (`/api/kb/stats`,
`/api/kb/budget` when `ENABLE_OBSERVABILITY_API=1`, `/api/health`)
stay live so operators can still see what's happening.

**Scope (read this before reaching for it)**: emergency stop does
**not** freeze Boardly's non-AI write endpoints (cards, lists,
comments, invitations, workspaces). Those continue to accept traffic
because they don't spend Gemini quota; a Gemini-key abuse event
shouldn't collaterally lock users out of their own boards. For a
full write freeze during a DB outage or data-corruption incident,
use `READ_ONLY=1` (see §1 Neon Postgres down). ADR-0046 § Trade-offs
explains why the two controls stay separate.

**When to reach for it**

- Suspected Gemini key leak — before the key has been rotated
- Traffic anomaly that the per-IP + per-container budgets haven't
  contained (e.g. botnet-scale IP rotation)
- Abuse report that needs a pause while you investigate
- Any situation where the right answer is "stop everything, think"

**How to activate (Vercel)**

1. Vercel dashboard → project → Settings → Environment Variables
2. Add `EMERGENCY_STOP=1` to Production (and Preview if you want that
   covered too)
3. Deployments → ⋯ → **Redeploy** the current production build
   (no code change needed; env reads happen per request after deploy)
4. Verify: `curl -sS https://<host>/api/kb/budget | jq .emergencyStop`
   returns `true`
5. Verify: `curl -sS -X POST https://<host>/api/kb/ask -H content-type:application/json -d '{"question":"x"}'`
   returns HTTP 503 with `{ "code": "EMERGENCY_STOP" }`

**While stopped**

- Reads continue: landing, `/docs/api`, `/kb` (UI stays browsable),
  `/api/kb/stats`, `/api/kb/budget`, `/api/openapi.json`
- Writes fail fast with a stable, non-PII-leaking `{ code, message }`
  body and `Retry-After: 3600`
- CI smoke tests will still pass (they only hit read endpoints and
  public pages)

**How to restore**

1. Only after the underlying cause is resolved (key rotated, budget
   restored, abuse mitigated)
2. Vercel Settings → Environment Variables → delete `EMERGENCY_STOP`
   (or set to `0`)
3. Redeploy
4. Verify the `/api/kb/budget` response now reports `emergencyStop: false`,
   and a fresh `/api/kb/ask` probe streams successfully

**Data loss risk during stop**: zero. No writes are partially applied;
the handler short-circuits before any DB or embedding call.
