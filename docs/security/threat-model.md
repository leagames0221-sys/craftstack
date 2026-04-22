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

| ID   | Threat                                    | Mitigation                                                           |
| ---- | ----------------------------------------- | -------------------------------------------------------------------- |
| T-01 | WebSocket message forging across tenants  | Handshake-time membership check; per-event workspace/board assertion |
| T-02 | Version omission to overwrite latest card | Zod schema requires `version`; missing value → 400                   |
| T-03 | Webhook payload tampering                 | HMAC-SHA256 signature required; receivers verify before acting       |
| T-04 | MIME spoofing on upload                   | `file-type` magic-byte probe + extension + declared MIME must agree  |

## Repudiation

| ID   | Threat               | Mitigation                                                                            |
| ---- | -------------------- | ------------------------------------------------------------------------------------- |
| R-01 | Silent deletion      | AuditLog append-only; actor column `SetNull` so the event survives user deletion      |
| R-02 | API key usage denial | `ApiKey.lastUsedAt`; AuditLog entry with `action = API_CALL` for every key invocation |

## Information Disclosure

| ID   | Threat                                      | Mitigation                                                         |
| ---- | ------------------------------------------- | ------------------------------------------------------------------ |
| I-01 | Cross-tenant read                           | RLS + `withTenant()` query wrapper (ADR-0010)                      |
| I-02 | Stack trace in production response          | Standardized `{ code, message }` body; stack logged only to Sentry |
| I-03 | Enumeration via search                      | Rate limit on search endpoints; 5-hit cap per query page           |
| I-04 | PII in application logs                     | `pino.redact` masks email/token fields before shipping             |
| I-05 | Prompt injection exfiltrating system prompt | System vs User vs Document tags; `<document>` delimited context    |

## Denial of Service

| ID   | Threat                                | Mitigation                                                            |
| ---- | ------------------------------------- | --------------------------------------------------------------------- |
| D-01 | Client flooding WebSocket connections | 5 concurrent sockets per user; per-IP cap at the Fly.io edge          |
| D-02 | Oversize upload                       | `sizeBytes` checked at presign; R2 bucket policy enforces the ceiling |
| D-03 | Folder tree DoS via deep nesting      | Folder depth ≤ 10 enforced at the API layer                           |
| D-04 | Exhaustion of Gemini daily quota      | Per-user rate limit (search 30/min, chat 10/min); fallback to Groq    |

## Elevation of Privilege

| ID   | Threat                               | Mitigation                                                                   |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------- |
| E-01 | Viewer writing via PATCH             | `requireRole()` at both REST and WebSocket layers                            |
| E-02 | API key used outside declared scopes | Scopes validated per endpoint; missing scope → 403                           |
| E-03 | SQL injection                        | Prisma parameterization only; raw queries via `Prisma.sql` template literals |

## Out-of-scope for v1 (tracked, not mitigated)

- Client-device compromise
- Physical attacks on hosting providers
- Regulatory data-residency (customers served from a single AWS region via Fly.io; configurable later)
