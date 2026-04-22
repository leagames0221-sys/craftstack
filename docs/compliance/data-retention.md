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

A nightly BullMQ repeatable job at 03:00 JST enumerates expired rows and deletes them. Deletion counts are emitted as a structured log line and visualized on Better Stack.

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

v1 serves everyone out of the default Fly.io region (NRT). Expansion plan is documented under ADR-0009 but not implemented.
