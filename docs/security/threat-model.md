# STRIDE threat model

Coverage is per-app where relevant; otherwise applies to the monorepo as a whole.
Numbering conforms to STRIDE so each row has a single, distinct category.

## Spoofing (identity)

| ID   | Threat                          | Mitigation                                                                |
| ---- | ------------------------------- | ------------------------------------------------------------------------- |
| S-01 | Session cookie theft            | `HttpOnly` + `Secure` + `SameSite=Lax` + `__Secure-` prefix; HSTS 2 years |
| S-02 | CSRF on state-changing requests | Auth.js built-in token; `SameSite=Lax`                                    |
| S-03 | OAuth state fixation            | Auth.js standard state + PKCE                                             |
| S-04 | API key guessing                | Argon2id hash at rest; `klx_` prefix + 64-char random suffix              |

## Tampering (data integrity)

| ID   | Threat                                              | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01 | Pusher channel eavesdropping on `board-<id>` events | Per ADR-0052, Boardly fanout is Pusher Channels (`apps/collab/src/lib/pusher.ts` server-emit, `apps/collab/src/lib/pusher-client.ts` browser subscribe). Channel name is `board-<boardId>`. **Honest scope note**: v0.5.2 uses **public Pusher channels** — anyone who learns a `boardId` and the public Pusher key can subscribe and observe broadcast events. The defence is that boardIds are only visible through authenticated REST endpoints (`/api/workspaces/:slug/boards`, `/w/:slug/b/:boardId` page) gated by `requireWorkspaceMember`; broadcast event payloads are minimal (kind + listId + cardId) and never include card content. Migrating to private/presence channels with a server-signed auth route is on the v0.6.0 roadmap to make this defence-in-depth instead of access-control-by-id-secrecy |
| T-02 | Version omission to overwrite latest card           | Zod schema requires `version`; missing value → 400                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T-03 | Webhook payload tampering                           | HMAC-SHA256 signature required; receivers verify before acting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| T-04 | MIME spoofing on upload                             | `file-type` magic-byte probe + extension + declared MIME must agree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Repudiation

| ID   | Threat               | Mitigation                                                                            |
| ---- | -------------------- | ------------------------------------------------------------------------------------- |
| R-01 | Silent deletion      | AuditLog append-only; actor column `SetNull` so the event survives user deletion      |
| R-02 | API key usage denial | `ApiKey.lastUsedAt`; AuditLog entry with `action = API_CALL` for every key invocation |

## Information Disclosure

| ID   | Threat                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-01 | Cross-tenant read                           | **v0.5.2 status**: Knowlex is **single-tenant** per ADR-0039 MVP scope (one `Workspace` row, all Documents share `workspaceId=wks_default_v050`); ADR-0047 v0.5.0 partial added `workspaceId NOT NULL` schema partitioning so the multi-tenant migration path is one route-guard layer away. RLS + `withTenant()` per ADR-0010 is design-phase and deferred. Auth-gated `requireWorkspaceMember` route guards land in v0.5.4 once Auth.js ships on Knowlex |
| I-02 | Stack trace in production response          | Standardized `{ code, message }` body; stack logged only to Sentry                                                                                                                                                                                                                                                                                                                                                                                         |
| I-03 | Enumeration via search                      | Rate limit on search endpoints; 5-hit cap per query page                                                                                                                                                                                                                                                                                                                                                                                                   |
| I-04 | PII in application logs                     | `pino.redact` masks email/token fields before shipping                                                                                                                                                                                                                                                                                                                                                                                                     |
| I-05 | Prompt injection exfiltrating system prompt | System vs User vs Document tags; `<document>` delimited context                                                                                                                                                                                                                                                                                                                                                                                            |

## Denial of Service

| ID   | Threat                           | Mitigation                                                                                                                                                                                                        |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Client flooding realtime fanout  | Pusher Channels Sandbox enforces 100 concurrent connections + 200k msg/day at the vendor edge per ADR-0052; per-IP rate limiter on `/api/cards/:id/move` and other write paths blocks single-source amplification |
| D-02 | Oversize upload                  | `sizeBytes` checked at presign; R2 bucket policy enforces the ceiling                                                                                                                                             |
| D-03 | Folder tree DoS via deep nesting | Folder depth ≤ 10 enforced at the API layer                                                                                                                                                                       |
| D-04 | Exhaustion of Gemini daily quota | Per-user rate limit (search 30/min, chat 10/min); fallback to Groq                                                                                                                                                |

## Elevation of Privilege

| ID   | Threat                               | Mitigation                                                                                                                                                                           |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E-01 | Viewer writing via PATCH             | `requireRole()` enforced at every REST handler; Pusher emit per ADR-0052 is server-side only after the same authz check, so there is no client-to-server WebSocket surface to bypass |
| E-02 | API key used outside declared scopes | Scopes validated per endpoint; missing scope → 403                                                                                                                                   |
| E-03 | SQL injection                        | Prisma parameterization only; raw queries via `Prisma.sql` template literals                                                                                                         |

## Cost exhaustion (free-tier resilience)

Dedicated category for the attack shape this portfolio is most exposed
to: a malicious actor burning the operator's inference or bandwidth
budget. Every mitigation here is implemented; see ADR-0037 (layered
budgets), ADR-0043 (cost-guard parity), and ADR-0046 (zero-cost by
construction).

| ID   | Threat                                             | Mitigation                                                                                                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Attacker floods `/api/kb/ask` from a single IP     | `kb-rate-limit.ts` per-IP sliding window (10 req / 60 s); 429 with `Retry-After`                                                                                                                                                                                                                                            |
| C-02 | Attacker rotates IPs to bypass per-IP cap          | `global-budget.ts` per-container day/month ceiling (800/day, 10 000/month default); 429 `BUDGET_EXCEEDED_{DAY,MONTH}` with `Retry-After`                                                                                                                                                                                    |
| C-03 | Gemini key leak rotated to a billing-enabled key   | Key provenance locked to Google AI Studio (free-tier only); `scripts/check-free-tier-compliance.mjs` blocks PR merges that introduce paid SDKs; `docs/FREE_TIER_ONBOARDING.md` forbids Cloud Console keys                                                                                                                   |
| C-04 | Infrastructure tier silently upgraded to paid      | No credit card on file at Vercel / Neon / Upstash / Resend / Sentry; Hobby/Free tiers refuse rather than auto-scale; CI gate rejects `"plan": "pro"` / `"enterprise"` in any `vercel.json`                                                                                                                                  |
| C-05 | Slow to respond to a live key leak or abuse wave   | `EMERGENCY_STOP=1` env flag disables the Gemini-consuming endpoints (`/api/kb/{ask,ingest}` + collab playground `/api/kb/ask`) on the next request; non-AI write routes are unaffected by design and `READ_ONLY=1` handles the DB-outage case separately (runbook § 1 / § 9); see ADR-0046 § Trade-offs for scope rationale |
| C-06 | Oversize ingest payload exhausts Neon free storage | `apps/knowledge/src/app/api/kb/ingest/route.ts` caps `content` at 50 000 chars via Zod before any DB / embedding work                                                                                                                                                                                                       |

**Verification**: [`docs/security/ATTACK_SIMULATION.md`](./ATTACK_SIMULATION.md)
describes the `scripts/attack-simulation.mjs` bench that exercises
every row above against a running deployment, in one command. Honest
limitations (including the known per-container limiter gap on Vercel
multi-region) are called out there rather than hidden.

**Failure mode**: every layer here `refuses` rather than `scales`.
There is no path from this repository's configuration to a billed
invoice without an explicit, deliberate operator action: plan upgrade,
credit card on file, and env rotation to a paid key. The guarantee is
structural, not aspirational.

## Out-of-scope for v1 (tracked, not mitigated)

- Client-device compromise
- Physical attacks on hosting providers
- Regulatory data-residency (the v0.5.2 deploy serves all traffic out of Vercel's edge network with the data plane on Neon Singapore; the original ADR-0009 multi-region Fly.io plan was superseded by ADR-0052 — multi-region expansion is post-v1.0)
