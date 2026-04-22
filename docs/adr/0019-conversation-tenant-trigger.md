# ADR-0019: Conversation/Message tenant-member trigger

- Status: Accepted
- Date: 2026-04-22
- Tags: database, security

## Context

`Conversation.userId` references the global User table. An attacker who inserts a user-id from a different tenant would slip past table-level RLS because `TenantMember` membership is not implied by the FK.

## Decision

Add a PostgreSQL trigger on `Conversation` (and `Message.userId` when applicable) that raises an exception unless the user is a member of the referenced tenant.

```sql
CREATE FUNCTION assert_user_in_tenant() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "TenantMember"
    WHERE "userId" = NEW."userId"
      AND "tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'user % is not a member of tenant %', NEW."userId", NEW."tenantId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Consequences

Positive:

- Invariant enforced by the database, not by application code
- Survives any future API handler mistakes

Negative:

- Trigger adds cost to writes; acceptable for the low-volume tables involved
