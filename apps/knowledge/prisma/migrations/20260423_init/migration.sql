-- Knowlex MVP initial migration.
-- Hand-written because pgvector's `vector` column type needs the
-- extension created first and Prisma's generator can't express the
-- CREATE EXTENSION step.

CREATE EXTENSION IF NOT EXISTS vector;

-- Document: pasted text owned by the tenantless single-user MVP.
CREATE TABLE "Document" (
  "id"        TEXT    PRIMARY KEY,
  "title"     TEXT    NOT NULL,
  "content"   TEXT    NOT NULL,
  "charCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- Chunk: the retrieval unit, ordered within its parent Document.
CREATE TABLE "Chunk" (
  "id"         TEXT    PRIMARY KEY,
  "documentId" TEXT    NOT NULL,
  "ordinal"    INTEGER NOT NULL,
  "content"    TEXT    NOT NULL,
  "tokenCount" INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Chunk_documentId_ordinal_key" ON "Chunk"("documentId", "ordinal");
CREATE INDEX "Chunk_documentId_idx" ON "Chunk"("documentId");

-- Embedding: pgvector 768-dim (text-embedding-004).
CREATE TABLE "Embedding" (
  "chunkId"   TEXT PRIMARY KEY,
  "model"     TEXT NOT NULL,
  "dim"       INTEGER NOT NULL,
  "embedding" vector(768) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Embedding_chunkId_fkey"
    FOREIGN KEY ("chunkId") REFERENCES "Chunk"("id") ON DELETE CASCADE
);
-- ivfflat for cosine similarity. For an MVP with hundreds of chunks an
-- ivfflat index is overkill (a seq-scan is fast enough); we add it as a
-- forward-compat placeholder. `lists = 100` is a reasonable default at
-- this corpus size per pgvector docs.
CREATE INDEX "Embedding_embedding_cosine_idx"
  ON "Embedding" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
