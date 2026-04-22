# Runbook

Incident playbook for production services. Every section follows the same shape:
**Symptoms → Triage → Mitigation → Root cause follow-up.**

## Table of contents

1. [Neon Postgres down](#1-neon-postgres-down)
2. [Upstash Redis down](#2-upstash-redis-down)
3. [Socket.IO server down on Fly.io](#3-socket-io-server-down-on-fly-io)
4. [Gemini rate limit exhausted](#4-gemini-rate-limit-exhausted)
5. [Cloudflare R2 degraded](#5-cloudflare-r2-degraded)
6. [High latency at the edge](#6-high-latency-at-the-edge)
7. [Data corruption recovery](#7-data-corruption-recovery)
8. [Incident report template](#8-incident-report-template)

---

## 1. Neon Postgres down

**Symptoms**

- `/api/me` returns 500
- Sentry: burst of `PrismaClientInitializationError`
- UptimeRobot health check flaps

**Triage**

1. Neon console → project status
2. `psql $DIRECT_DATABASE_URL -c "SELECT 1"` from a local shell
3. Read the start-of-incident timestamp from UptimeRobot

**Mitigation**

- Flip `READ_ONLY=1` in Vercel → redeploy. App will respond to reads from cached Redis sessions; every mutation returns `{ code: "READ_ONLY" }` with HTTP 503.
- Once Neon recovers, unset `READ_ONLY` and redeploy.

**Root cause follow-up**

- If Neon auto-suspend triggered, verify UptimeRobot is pinging `/api/health` on a 4-minute interval (ADR-0016).
- If monthly compute hours exceeded, schedule Neon Pro upgrade.

---

## 2. Upstash Redis down

**Symptoms**

- Cross-instance WebSocket broadcasts stop arriving at clients on another node
- Rate limiter behaves unpredictably

**Mitigation**

- Set `SINGLE_NODE=1` on Fly.io so broadcasts are in-process only
- Fall back to the in-memory `@upstash/ratelimit` adapter
- If >5 min outage, scale Fly.io to 1 instance temporarily

---

## 3. Socket.IO server down on Fly.io

**Symptoms**

- Clients can't join rooms
- `/api/health` remains OK

**Triage**

- `flyctl status -a boardly-ws`
- `flyctl logs -a boardly-ws`

**Mitigation**

- `flyctl restart -a boardly-ws`
- If OOM: check `NODE_OPTIONS=--max-old-space-size=200` is applied

---

## 4. Gemini rate limit exhausted

**Symptoms**

- `/api/conversations/:id/messages` returns 429 mid-stream

**Mitigation**

- Runtime switches to Groq (Llama 3.3) automatically
- Show toast: "Service is temporarily busy — please retry shortly"
- Confirm quota reset time in Google AI Studio

---

## 5. Cloudflare R2 degraded

**Symptoms**

- Attachment uploads 503
- Document previews fail to load

**Mitigation**

- Surface a banner on the upload UI
- Queued ingestion pauses automatically (BullMQ retry with backoff)

---

## 6. High latency at the edge

**Triage order**

1. Vercel → Analytics → p95 by route
2. Better Stack → API traces
3. Check Neon → Slow Queries tab
4. Check Upstash → Commands/sec graph

---

## 7. Data corruption recovery

**Procedure**

1. Stop writes (`READ_ONLY=1`)
2. Restore from Neon PITR to a shadow project
3. Compare checksums of affected tables
4. Replay traffic from BullMQ dead-letter queue if applicable

---

## 8. Incident report template

```markdown
# Incident <YYYY-MM-DD>: <one-line headline>

**Severity**: SEV1 | SEV2 | SEV3
**Impact start**: YYYY-MM-DD HH:MM UTC
**Impact end**: YYYY-MM-DD HH:MM UTC
**Affected**: <apps / regions / user %>

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
```
