-- ADR-0047 v0.5.0 partial implementation:
-- schema partitioning by Workspace, default-workspace backfill.
-- Member-based access control (WorkspaceMember table + auth-gated
-- route guards) deferred to v0.5.2 once Auth.js lands on Knowlex.

-- ---- Step 1: create the Workspace table ----
CREATE TABLE "Workspace" (
  "id"        TEXT    PRIMARY KEY,
  "name"      TEXT    NOT NULL,
  "slug"      TEXT    NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- ---- Step 2: seed the `default` workspace ----
-- The id `wks_default_v050` is stable so application code can refer
-- to it without first SELECTing by slug. The slug `default` is the
-- public identifier; the human-readable name is "Default workspace".
INSERT INTO "Workspace" ("id", "name", "slug", "createdAt")
VALUES (
  'wks_default_v050',
  'Default workspace',
  'default',
  CURRENT_TIMESTAMP
);

-- ---- Step 3: add Document.workspaceId, nullable for the
--             additive deploy then backfilled below ----
ALTER TABLE "Document" ADD COLUMN "workspaceId" TEXT;

-- ---- Step 4: backfill every existing Document to the
--             default workspace ----
UPDATE "Document" SET "workspaceId" = 'wks_default_v050' WHERE "workspaceId" IS NULL;

-- ---- Step 5: tighten the column to NOT NULL + add the FK ----
ALTER TABLE "Document" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

-- ---- Step 6: add the composite index for workspace-scoped listing ----
CREATE INDEX "Document_workspaceId_createdAt_idx"
  ON "Document"("workspaceId", "createdAt");
