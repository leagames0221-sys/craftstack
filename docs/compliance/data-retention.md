# Data retention policy

## Soft delete → physical delete

| Entity                 | Retention after soft delete    |
| ---------------------- | ------------------------------ |
| Workspace / Tenant     | 30 days                        |
| Document (Knowlex)     | 30 days, including R2 object   |
| Conversation (Knowlex) | 90 days                        |
| AuditLog               | 365 days, then physical delete |
| Session                | 7 days after expiry            |
| VerificationToken      | 24 hours                       |

> **Implementation status (v0.5.2)**: the soft-delete columns and 30-/90-/365-day windows above are wired at the Prisma schema layer, but the **automated cleanup job is not yet shipped**. The original design-phase plan was a BullMQ repeatable job at 03:00 JST on the Fly.io worker (per ADR-0009), but the Pusher pivot (per ADR-0052) removed Fly.io from the deploy footprint. A Vercel Cron-based equivalent is on the v0.6.0 roadmap; until then, a manual `prisma` script can be run if a physical-delete sweep is needed for a specific GDPR-equivalent erasure request.

## User erasure requests (GDPR-equivalent)

- `DELETE /api/me` flags the user as soft-deleted; 30 days later a worker performs the physical delete
- If the user is a workspace `OWNER`, erasure is blocked until ownership transfer completes
- Derived rows (Membership, Invitation actor, AuditLog actor) use `onDelete: SetNull` so audit evidence survives without identifying the deleted user

## Backups

- Neon PITR: 7 days on Free, 30 days on Pro (ADR-0016)
- R2: versioning disabled on Free; acceptable because DocumentVersion is tracked in the DB and original files can be re-uploaded

## Data export

- `/api/tenants/:slug/export` → asynchronous job that bundles conversations and documents into a zip in R2 with a 24-hour presigned download URL
- `/api/boards/:id/export?format=json|csv` → synchronous, for single boards

## Regional residency

v0.5.2 serves all traffic out of Vercel's edge network (region selection is Vercel-managed; the Boardly + Knowlex Vercel projects are configured against Neon Singapore for the data plane). The original design-phase plan was Fly.io NRT region per ADR-0009; superseded by the Pusher pivot per ADR-0052 — Vercel-only deploy is what ships. Multi-region expansion is on the post-v1.0 roadmap.
