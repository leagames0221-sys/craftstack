---
name: Phase 4 - Prisma schema 完全版
type: project
---

# Phase 4(δ): Prisma schema 完全版 + RLS + pgvector

両アプリは **別 DB インスタンス**(ADR-0018)。schema も別ファイル。

## Boardly `apps/collab/prisma/schema.prisma` 構成要素

### generator / datasource

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearchPostgres", "postgresqlExtensions"]
}
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")        // app ロール
  directUrl  = env("DIRECT_DATABASE_URL") // migrator ロール
  extensions = [pg_trgm]
}
```

### Enum

- `Role` = OWNER | ADMIN | EDITOR | VIEWER
- `Theme` = SYSTEM | LIGHT | DARK
- `ActivityAction` = WORKSPACE_CREATED 等 24 種
- `NotificationType` = MENTION | ASSIGNED | DUE_SOON | INVITED | COMMENT_ON_CARD

### テーブル一覧(Boardly)

1. Auth.js adapter: Account / Session / VerificationToken
2. Core: User / Workspace / Membership / Invitation
3. Kanban: Board / List / Card
4. Label: Label / CardLabel / CardAssignee
5. Comment: Comment / Mention
6. Attachment: Attachment
7. Log: ActivityLog
8. Notification: Notification / NotificationSubscription

### onDelete 指針(Critical 修正反映)

- `ActivityLog.actor → User`: **SetNull**(actorId nullable)
- `Invitation.inviter → User`: **SetNull**(inviterId nullable)
- `Workspace 配下 (Board/Label/Membership/Invitation/ActivityLog)`: Cascade
- `Board 配下 (List)`: Cascade
- `List 配下 (Card)`: Cascade
- `Card 配下 (Comment/Attachment/CardLabel/CardAssignee)`: Cascade
- `Comment 配下 (Mention)`: Cascade
- `User 削除時`: memberships/comments/mentions/subscriptions Cascade、ActivityLog/Invitation は SetNull

### Card の楽観ロック

```prisma
model Card {
  // ...
  version Int @default(1)
}
```

PATCH で `version` mismatch → 409 返却。

### LexoRank

`position String`(文字列)。`@hellopablo/lexorank` ライブラリで生成。

### 手書き migration(全文検索)

```sql
ALTER TABLE "Card" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title",'')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description",'')), 'B')
  ) STORED;
CREATE INDEX card_search_idx ON "Card" USING GIN ("search_vector");

ALTER TABLE "Comment" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("body",''))) STORED;
CREATE INDEX comment_search_idx ON "Comment" USING GIN ("search_vector");

CREATE INDEX card_title_trgm_idx ON "Card" USING GIN ("title" gin_trgm_ops);
CREATE INDEX comment_body_trgm_idx ON "Comment" USING GIN ("body" gin_trgm_ops);
```

---

## Knowlex `apps/knowledge/prisma/schema.prisma` 構成要素

### generator / datasource

```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_DATABASE_URL")
  extensions = [pgvector(map: "vector"), pg_trgm]
}
```

### Enum

- `Role`, `Theme`, `Plan`(FREE/PRO/ENTERPRISE)
- `SourceType`(PDF/MARKDOWN/DOCX/TEXT/URL/HTML)
- `DocumentStatus`(PENDING/PROCESSING/READY/FAILED)
- `Visibility`(TENANT/FOLDER/PRIVATE)
- `MessageRole`(USER/ASSISTANT/SYSTEM)
- `FeedbackRating`(UP/DOWN)
- `AuditAction`(13 種)

### テーブル一覧(Knowlex)

1. Auth.js adapter
2. Core: User / Tenant / TenantMember / TenantInvitation
3. Doc: Folder / Document / DocumentVersion / Chunk / **Embedding(分離)**
4. Conv: Conversation / Message / Citation / Feedback
5. Ext: ApiKey / Webhook / AuditLog / Usage
6. Notif: Notification / NotificationSubscription

### Embedding 分離設計(ADR-0012)

```prisma
model Chunk {
  id                String   @id @default(cuid())
  documentVersionId String
  ordinal           Int
  content           String   @db.Text
  meta              Json     @default("{}")
  tokenCount        Int
  embedding         Embedding?
  // ...
}
model Embedding {
  chunkId   String   @id
  model     String
  dim       Int
  createdAt DateTime @default(now())
  chunk     Chunk    @relation(fields: [chunkId], references: [id], onDelete: Cascade)
  @@index([model])
}
```

`vector(768)` 列は手書き migration で追加(Prisma は vector 型を直接扱えない)。

### onDelete 指針(Critical 修正反映)

- `TenantInvitation.inviter`, `Conversation.user`, `Feedback.user`, `AuditLog.actor` → **SetNull**
- `Document.owner` → **Restrict**(監査のため削除ブロック)
- `Citation.chunk` → **Restrict**(引用整合性)
- Tenant 配下 → Cascade

### pgvector + RLS 手書き migration

```sql
-- 拡張
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Embedding に vector 列追加
ALTER TABLE "Embedding" ADD COLUMN "embedding" vector(768);
CREATE INDEX embedding_hnsw_idx
  ON "Embedding"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Chunk 全文検索
ALTER TABLE "Chunk" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content",''))) STORED;
CREATE INDEX chunk_search_idx ON "Chunk" USING GIN ("search_vector");
CREATE INDEX chunk_content_trgm_idx ON "Chunk" USING GIN ("content" gin_trgm_ops);

-- RLS(Tenant 本体を除く!Critical 修正)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'TenantMember','TenantInvitation',
      'Folder','Document','DocumentVersion','Chunk','Embedding',
      'Conversation','Message','Citation','Feedback',
      'ApiKey','Webhook','AuditLog','Usage'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Tenant はアプリ層で TenantMember 経由で絞る(RLS 適用しない)

-- 直接 tenantId を持つテーブル
CREATE POLICY tenant_iso ON "TenantMember" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_iso ON "Folder" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_iso ON "Document" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_iso ON "Conversation" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_iso ON "ApiKey" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_iso ON "Webhook" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_iso ON "AuditLog" USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_iso ON "Usage" USING ("tenantId" = current_setting('app.tenant_id', true)::text);

-- 間接的な紐づき(参照で縛る)
CREATE POLICY tenant_iso ON "DocumentVersion" USING (
  EXISTS (SELECT 1 FROM "Document" d
    WHERE d.id = "DocumentVersion"."documentId"
      AND d."tenantId" = current_setting('app.tenant_id', true)::text));

CREATE POLICY tenant_iso ON "Chunk" USING (
  EXISTS (SELECT 1 FROM "DocumentVersion" v
    JOIN "Document" d ON d.id = v."documentId"
    WHERE v.id = "Chunk"."documentVersionId"
      AND d."tenantId" = current_setting('app.tenant_id', true)::text));

CREATE POLICY tenant_iso ON "Embedding" USING (
  EXISTS (SELECT 1 FROM "Chunk" c
    JOIN "DocumentVersion" v ON v.id = c."documentVersionId"
    JOIN "Document" d ON d.id = v."documentId"
    WHERE c.id = "Embedding"."chunkId"
      AND d."tenantId" = current_setting('app.tenant_id', true)::text));

CREATE POLICY tenant_iso ON "Message" USING (
  EXISTS (SELECT 1 FROM "Conversation" c
    WHERE c.id = "Message"."conversationId"
      AND c."tenantId" = current_setting('app.tenant_id', true)::text));

CREATE POLICY tenant_iso ON "Citation" USING (
  EXISTS (SELECT 1 FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE m.id = "Citation"."messageId"
      AND c."tenantId" = current_setting('app.tenant_id', true)::text));

CREATE POLICY tenant_iso ON "Feedback" USING (
  EXISTS (SELECT 1 FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE m.id = "Feedback"."messageId"
      AND c."tenantId" = current_setting('app.tenant_id', true)::text));

-- Conversation / Message tenant 整合トリガー(ADR-0019)
CREATE FUNCTION assert_user_in_tenant() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "TenantMember"
    WHERE "userId" = NEW."userId" AND "tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'user % is not a member of tenant %', NEW."userId", NEW."tenantId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conv_tenant_member
BEFORE INSERT OR UPDATE ON "Conversation"
FOR EACH ROW EXECUTE FUNCTION assert_user_in_tenant();
```

## migrator / app ロール分離(ADR-0010 追補)

```sql
CREATE ROLE migrator WITH LOGIN PASSWORD '<secret>' BYPASSRLS;
CREATE ROLE app WITH LOGIN PASSWORD '<secret>';

GRANT CONNECT ON DATABASE knowlex TO app, migrator;
GRANT USAGE ON SCHEMA public TO app, migrator;
GRANT ALL ON ALL TABLES IN SCHEMA public TO migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
```

- `DATABASE_URL` = app ロール(実行時)
- `DIRECT_DATABASE_URL` = migrator(`prisma migrate dev/deploy`)

## `packages/db/src/client.ts` ヘルパ

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// RLS 用トランザクション(Knowlex 全 API で必須)
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx as unknown as PrismaClient);
  });
}
```

## Vector 検索 helper

```typescript
import { Prisma } from "@prisma/client";
export const vectorSearch = (
  embedding: number[],
  tenantId: string,
  topK = 50,
) => Prisma.sql`
  SELECT c.id, c.content, c."documentVersionId",
         1 - (e.embedding <=> ${embedding}::vector) AS score
  FROM "Embedding" e
  JOIN "Chunk" c ON c.id = e."chunkId"
  JOIN "DocumentVersion" v ON v.id = c."documentVersionId"
  JOIN "Document" d ON d.id = v."documentId"
  WHERE d."tenantId" = ${tenantId}
    AND d."deletedAt" IS NULL AND d."status" = 'READY'
  ORDER BY e.embedding <=> ${embedding}::vector
  LIMIT ${topK}
`;
```

## DoD

- [ ] 両 schema が `prisma format` 通過
- [ ] `prisma migrate dev` で DIRECT_DATABASE_URL 経由で適用成功
- [ ] pgvector/RLS 手書き migration 適用
- [ ] Seed 完走
- [ ] packages/db から両アプリ import 可能
- [ ] CI `prisma validate` 実行
