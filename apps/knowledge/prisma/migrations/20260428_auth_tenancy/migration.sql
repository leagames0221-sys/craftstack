-- ADR-0061 v0.5.12: Auth.js on Knowlex + multi-tenant transition.
--
-- Closes the access-control half of ADR-0047 § Status (deferred since
-- the v0.5.0 schema partitioning ratchet). Adds the Auth.js v5 tables
-- (User / Account / Session / VerificationToken) plus Membership for
-- workspace-scoped access control. The existing `wks_default_v050`
-- demo workspace is preserved verbatim and continues to be
-- anonymously readable via the route-level allow-list (see
-- requireWorkspaceMember / requireDemoOrMember in
-- apps/knowledge/src/auth/access.ts).
--
-- This migration is additive only: no existing column changes, no
-- existing row mutations. Backward-compatible with the v0.5.0 ->
-- v0.5.11 deployed state.

-- ---- Step 1: Auth.js v5 core tables ----

CREATE TABLE "User" (
  "id"             TEXT         PRIMARY KEY,
  "email"          TEXT         NOT NULL,
  "emailVerified"  TIMESTAMP(3),
  "name"           TEXT,
  "image"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");

CREATE TABLE "Account" (
  "id"                 TEXT PRIMARY KEY,
  "userId"             TEXT NOT NULL,
  "type"               TEXT NOT NULL,
  "provider"           TEXT NOT NULL,
  "providerAccountId"  TEXT NOT NULL,
  "refresh_token"      TEXT,
  "access_token"       TEXT,
  "expires_at"         INTEGER,
  "token_type"         TEXT,
  "scope"              TEXT,
  "id_token"           TEXT,
  "session_state"      TEXT
);
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key"
  ON "Account"("provider", "providerAccountId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

CREATE TABLE "Session" (
  "id"            TEXT          PRIMARY KEY,
  "sessionToken"  TEXT          NOT NULL,
  "userId"        TEXT          NOT NULL,
  "expires"       TIMESTAMP(3)  NOT NULL
);
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

CREATE TABLE "VerificationToken" (
  "identifier"  TEXT          NOT NULL,
  "token"       TEXT          NOT NULL,
  "expires"     TIMESTAMP(3)  NOT NULL
);
CREATE UNIQUE INDEX "VerificationToken_token_key"
  ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key"
  ON "VerificationToken"("identifier", "token");

-- ---- Step 2: Membership table (user × workspace × role) ----

CREATE TABLE "Membership" (
  "id"           TEXT          PRIMARY KEY,
  "userId"       TEXT          NOT NULL,
  "workspaceId"  TEXT          NOT NULL,
  "role"         TEXT          NOT NULL DEFAULT 'OWNER',
  "joinedAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Membership_userId_workspaceId_key"
  ON "Membership"("userId", "workspaceId");
CREATE INDEX "Membership_workspaceId_idx" ON "Membership"("workspaceId");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

-- ---- Step 3: Demo workspace stays anonymous-readable ----
--
-- The id `wks_default_v050` is the canonical demo workspace seeded
-- in the 20260426_workspace_tenancy migration. It is intentionally
-- NOT linked to any User via Membership: the route-level allowlist
-- in apps/knowledge/src/auth/access.ts handles anonymous reads
-- against this id. Documents previously ingested into the demo
-- workspace remain readable to anyone, preserving the live demo
-- experience (per ADR-0061 § Demo split).
--
-- No INSERT / UPDATE statements here: the demo workspace already
-- exists from the previous migration.