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
 * pgvector's `<=>` cosine-distance operator. The ivfflat index is used
 * transparently when present; a small corpus hits the seq-scan path
 * and is still sub-10 ms on Neon.
 *
 * Joins back to Document so the caller can cite by title without a
 * second round-trip.
 */
export async function retrieveTopK(opts: {
  apiKey: string;
  question: string;
  k?: number;
}): Promise<RetrievedChunk[]> {
  const k = Math.max(1, Math.min(16, opts.k ?? 6));
  const trimmed = opts.question.trim();
  if (trimmed.length === 0) return [];

  const [queryVector] = await embedTexts(opts.apiKey, [trimmed]);
  const vec = vectorLiteral(queryVector);
  console.log(
    `[retrieve] queryVector dim=${queryVector.length}, k=${k}, vec preview=${vec.slice(0, 80)}...`,
  );

  // Fallback sanity: if the query vector has the wrong dimensionality
  // pgvector will throw on the `<=>` comparison. Surface that
  // explicitly so we see which side of the pipeline is off.
  const storedRows = await prisma.$queryRawUnsafe<
    Array<{ count: bigint; any_dim: number | null }>
  >(
    `SELECT COUNT(*) AS count, MAX(vector_dims("embedding")) AS any_dim FROM "Embedding"`,
  );
  console.log(
    `[retrieve] Embedding table: count=${Number(storedRows[0]?.count ?? 0n)}, stored_dim=${storedRows[0]?.any_dim ?? "?"}`,
  );

  // $queryRawUnsafe with parameter binding — pgvector needs an explicit
  // ::vector cast. Prisma's $queryRaw tagged template can't do that
  // cleanly because the vector literal arrives as a JS string.
  const rows = await prisma.$queryRawUnsafe<
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
