import { prisma } from "@/lib/db";
import { EMBEDDING_DIM, EMBEDDING_MODEL } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatsPayload = {
  documents: number;
  chunks: number;
  embeddings: number;
  orphanEmbeddings: number;
  storedDim: number | null;
  expectedDim: number;
  embeddingModel: string;
  indexType: string;
};

/**
 * GET /api/kb/stats — corpus health probe.
 *
 * Returns counts, dim consistency, and the pgvector index type in one
 * cheap query set. Designed to be curl'able from anywhere and to make
 * the "why is retrieval returning 0?" class of bugs observable in
 * seconds, instead of requiring a `console.log` redeploy cycle as
 * happened during the Session 252→253 ivfflat debug.
 */
export async function GET() {
  const [documents, chunks, embeddings] = await Promise.all([
    prisma.document.count(),
    prisma.chunk.count(),
    prisma.embedding.count(),
  ]);

  // Orphan detection: Embedding rows whose chunkId doesn't resolve to
  // a Chunk. Should always be zero given the FK + ON DELETE CASCADE,
  // but we surface it so the probe is self-verifying.
  const [orphanRow] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count
       FROM "Embedding" e
       LEFT JOIN "Chunk" c ON c."id" = e."chunkId"
      WHERE c."id" IS NULL`,
  );

  const [dimRow] = await prisma.$queryRawUnsafe<
    Array<{ stored_dim: number | null }>
  >(`SELECT MAX(vector_dims("embedding"))::int AS stored_dim FROM "Embedding"`);

  const [idxRow] = await prisma.$queryRawUnsafe<
    Array<{ amname: string | null }>
  >(
    `SELECT am.amname
       FROM pg_class      c
       JOIN pg_index      i  ON i.indexrelid = c.oid
       JOIN pg_am         am ON am.oid = c.relam
      WHERE c.relname = 'Embedding_embedding_cosine_idx'
      LIMIT 1`,
  );

  const payload: StatsPayload = {
    documents,
    chunks,
    embeddings,
    orphanEmbeddings: Number(orphanRow?.count ?? 0n),
    storedDim: dimRow?.stored_dim ?? null,
    expectedDim: EMBEDDING_DIM,
    embeddingModel: EMBEDDING_MODEL,
    indexType: idxRow?.amname ?? "unknown",
  };

  return Response.json(payload, {
    headers: { "cache-control": "no-store" },
  });
}
