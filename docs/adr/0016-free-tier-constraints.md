# ADR-0016: Free-tier infra constraints and mitigations

- Status: Accepted
- Date: 2026-04-22
- Tags: infra, cost

## Context

The project targets $0/month production cost. Every free tier has quirks that shape the architecture.

## Decision

Catalogue the constraints and bake the mitigations into the code before they bite.

| Provider      | Constraint                 | Mitigation                                                                    |
| ------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Neon          | 5-minute idle auto-suspend | UptimeRobot pings `/api/health` every 4 minutes                               |
| Neon          | 192 compute-hours/month    | CI uses SQLite where possible; no DB in unit tests                            |
| Upstash Redis | 10,000 commands/day        | Presence heartbeat 60s; broadcast diffs only; rate limit falls back to memory |
| Fly.io        | shared-cpu-1x 256MB        | `--max-old-space-size=200`; `binaryTarget` pinned to native                   |
| Fly.io        | credit card required       | Documented in README; Render as backup                                        |
| Cloudflare R2 | 10GB                       | Attachment cap 10MB; documents 50MB; old DocumentVersion rows GC'd            |
| Gemini        | 1,500 requests/day         | Eval: 10-sample on PR, 50-sample on main/nightly                              |
| Cohere        | 1,000 reranks/month        | Cross-encoder fallback locally                                                |
| Resend        | 3,000 mail/month           | Aggregate notifications hourly                                                |

## Consequences

Positive:

- No surprise outages from quota exhaustion
- Clear upgrade triggers when traffic justifies paid tiers

Negative:

- Each mitigation is operational code that must be maintained

## Alternatives

- Paid tiers from day one: rejected — the free-tier design is a differentiator
