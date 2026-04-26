import { prisma } from "@/lib/db";
import { embedTexts, vectorLiteral } from "@/lib/gemini";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  ordinal: number;
  content: string;
  /** Cosine distance ∈ [0, 2]; lower = more similar. */
  distance: number;
};

/**
 * Embed the question once and pull the top-K nearest chunks via
 * pgvector's `<=>` cosine-distance operator. Backed by an HNSW index
 * (see 20260424_hnsw migration) — we previously had ivfflat with
 * lists=100 which silently returned 0 rows on small corpora because
 * the default `probes=1` almost never hit the 1 list that held our
 * 2-3 rows.
 *
 * Joins back to Document so the caller can cite by title without a
 * second round-trip.
 */
export async function retrieveTopK(opts: {
  apiKey: string;
  question: string;
  k?: number;
  /**
   * ADR-0047 v0.5.0 partial implementation: when supplied, retrieval
   * is restricted to chunks whose parent document belongs to this
   * workspace. Required at the route layer to enforce data
   * partitioning even with the access-control gate deferred.
   */
  workspaceId?: string;
}): Promise<RetrievedChunk[]> {
  const k = Math.max(1, Math.min(16, opts.k ?? 6));
  const trimmed = opts.question.trim();
  if (trimmed.length === 0) return [];

  const [queryVector] = await embedTexts(opts.apiKey, [trimmed]);
  const vec = vectorLiteral(queryVector);

  // The workspace pre-filter happens in SQL (not at the index layer)
  // because pgvector's HNSW doesn't support compound vector+scalar
  // indexes efficiently in the current release. At sub-10k chunks per
  // workspace the join + scan is still sub-10ms — see ADR-0047
  // Trade-offs § "HNSW index not workspace-partitioned".
  const rows = opts.workspaceId
    ? await prisma.$queryRawUnsafe<
        Array<{
          chunkId: string;
          documentId: string;
          documentTitle: string;
          ordinal: number;
          content: string;
          distance: number;
        }>
      >(
        `SELECT
           e."chunkId"        AS "chunkId",
           c."documentId"     AS "documentId",
           d."title"          AS "documentTitle",
           c."ordinal"        AS "ordinal",
           c."content"        AS "content",
           (e."embedding" <=> $1::vector) AS "distance"
         FROM "Embedding" e
         JOIN "Chunk"    c ON c."id" = e."chunkId"
         JOIN "Document" d ON d."id" = c."documentId"
         WHERE d."workspaceId" = $3
         ORDER BY e."embedding" <=> $1::vector
         LIMIT $2`,
        vec,
        k,
        opts.workspaceId,
      )
    : await prisma.$queryRawUnsafe<
        Array<{
          chunkId: string;
          documentId: string;
          documentTitle: string;
          ordinal: number;
          content: string;
          distance: number;
        }>
      >(
        `SELECT
           e."chunkId"        AS "chunkId",
           c."documentId"     AS "documentId",
           d."title"          AS "documentTitle",
           c."ordinal"        AS "ordinal",
           c."content"        AS "content",
           (e."embedding" <=> $1::vector) AS "distance"
         FROM "Embedding" e
         JOIN "Chunk"    c ON c."id" = e."chunkId"
         JOIN "Document" d ON d."id" = c."documentId"
         ORDER BY e."embedding" <=> $1::vector
         LIMIT $2`,
        vec,
        k,
      );

  return rows.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    ordinal: Number(r.ordinal),
    content: r.content,
    distance: Number(r.distance),
  }));
}
