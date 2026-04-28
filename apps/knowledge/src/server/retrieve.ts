import { prisma } from "@/lib/db";
import { embedTexts, vectorLiteral } from "@/lib/gemini";
import { fuseRRF } from "./rrf";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  ordinal: number;
  content: string;
  /** Cosine distance ∈ [0, 2]; lower = more similar. */
  distance: number;
  /**
   * ADR-0063 hybrid retrieval. Populated when the hybrid path is taken;
   * carries which list(s) surfaced the chunk + its rank inside each.
   * Useful for debugging (a chunk surfaced only by lexical FTS but
   * absent from vector kNN signals an out-of-distribution embedding).
   * Absent when the retriever ran in pure-vector mode (default).
   */
  hybridSources?: Record<string, number>;
};

type ChunkRow = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  ordinal: number;
  content: string;
  distance: number;
};

/**
 * Whether the hybrid retrieval path (vector kNN + lexical FTS fused
 * via RRF) is active. Default off — `HYBRID_RETRIEVAL_ENABLED=1`
 * (or `=true`) opts in. Off by default because the default eval
 * cron runs against pure cosine kNN (the v0.5.13 baseline) and a
 * silent flip would invalidate run-to-run comparisons. ADR-0063
 * § Implementation status names this as the gating mechanism.
 */
export function isHybridRetrievalEnabled(): boolean {
  const v = process.env.HYBRID_RETRIEVAL_ENABLED;
  return v === "1" || v === "true";
}

/**
 * Top-N parameter for the per-list pre-fusion candidate pool. RRF
 * fuses two ranked lists of size N → returns top-K of the fused
 * ranking. N is intentionally larger than K (default N = 2K) so
 * documents that one list ranks low + the other ranks high don't
 * fall off the candidate pool before fusion. ADR-0063 § Tuning
 * documents the rationale.
 */
const HYBRID_CANDIDATE_MULTIPLIER = 2;

const VECTOR_SQL_BARE = `
  SELECT
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
  LIMIT $2
`;

const VECTOR_SQL_WORKSPACE = `
  SELECT
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
  LIMIT $2
`;

/**
 * Lexical retrieval via Postgres FTS. Distance field is set to a
 * neutral value (1.0) so the fused result type stays consistent;
 * callers should rely on `hybridSources` for provenance, not on the
 * distance value when a chunk was surfaced only by lexical FTS.
 *
 * `plainto_tsquery` is used (not `to_tsquery`) because user questions
 * are natural-language sentences with no Postgres-FTS-syntax
 * obligations. plainto_tsquery handles tokenization + stop-word
 * removal automatically. ts_rank_cd (cover-density rank) is used
 * over plain ts_rank because cover-density rewards passages that
 * contain the query terms close together — closer to BM25's
 * proximity component.
 */
const LEXICAL_SQL_BARE = `
  SELECT
    c."id"             AS "chunkId",
    c."documentId"     AS "documentId",
    d."title"          AS "documentTitle",
    c."ordinal"        AS "ordinal",
    c."content"        AS "content",
    1.0                AS "distance",
    ts_rank_cd(c."tsv", plainto_tsquery('english', $1)) AS "lex_score"
  FROM "Chunk" c
  JOIN "Document" d ON d."id" = c."documentId"
  WHERE c."tsv" @@ plainto_tsquery('english', $1)
  ORDER BY ts_rank_cd(c."tsv", plainto_tsquery('english', $1)) DESC
  LIMIT $2
`;

const LEXICAL_SQL_WORKSPACE = `
  SELECT
    c."id"             AS "chunkId",
    c."documentId"     AS "documentId",
    d."title"          AS "documentTitle",
    c."ordinal"        AS "ordinal",
    c."content"        AS "content",
    1.0                AS "distance",
    ts_rank_cd(c."tsv", plainto_tsquery('english', $1)) AS "lex_score"
  FROM "Chunk" c
  JOIN "Document" d ON d."id" = c."documentId"
  WHERE c."tsv" @@ plainto_tsquery('english', $1)
    AND d."workspaceId" = $3
  ORDER BY ts_rank_cd(c."tsv", plainto_tsquery('english', $1)) DESC
  LIMIT $2
`;

async function retrieveVector(opts: {
  vec: string;
  candidatePool: number;
  workspaceId?: string;
}): Promise<ChunkRow[]> {
  return opts.workspaceId
    ? await prisma.$queryRawUnsafe<ChunkRow[]>(
        VECTOR_SQL_WORKSPACE,
        opts.vec,
        opts.candidatePool,
        opts.workspaceId,
      )
    : await prisma.$queryRawUnsafe<ChunkRow[]>(
        VECTOR_SQL_BARE,
        opts.vec,
        opts.candidatePool,
      );
}

async function retrieveLexical(opts: {
  question: string;
  candidatePool: number;
  workspaceId?: string;
}): Promise<ChunkRow[]> {
  return opts.workspaceId
    ? await prisma.$queryRawUnsafe<ChunkRow[]>(
        LEXICAL_SQL_WORKSPACE,
        opts.question,
        opts.candidatePool,
        opts.workspaceId,
      )
    : await prisma.$queryRawUnsafe<ChunkRow[]>(
        LEXICAL_SQL_BARE,
        opts.question,
        opts.candidatePool,
      );
}

/**
 * Embed the question once and pull the top-K nearest chunks via
 * pgvector's `<=>` cosine-distance operator. Backed by an HNSW index
 * (see 20260424_hnsw migration) — we previously had ivfflat with
 * lists=100 which silently returned 0 rows on small corpora because
 * the default `probes=1` almost never hit the 1 list that held our
 * 2-3 rows.
 *
 * When `HYBRID_RETRIEVAL_ENABLED=1` is set in the environment, the
 * function additionally runs a Postgres FTS lookup on the new
 * `Chunk.tsv` column (ADR-0063 / closes ADR-0011) and fuses the two
 * ranked lists via Reciprocal Rank Fusion. The fused result preserves
 * the same `RetrievedChunk` shape so callers (`/api/kb/ask` →
 * `streamText` prompt assembly) need no change. The hybrid path
 * adds `hybridSources` to each result so debugging can see "this
 * chunk was rank 1 in vector, rank 4 in lexical" provenance.
 *
 * Joins back to Document so the caller can cite by title without a
 * second round-trip.
 */
export async function retrieveTopK(opts: {
  apiKey: string;
  question: string;
  k?: number;
  workspaceId?: string;
}): Promise<RetrievedChunk[]> {
  const k = Math.max(1, Math.min(16, opts.k ?? 6));
  const trimmed = opts.question.trim();
  if (trimmed.length === 0) return [];

  const [queryVector] = await embedTexts(opts.apiKey, [trimmed]);
  const vec = vectorLiteral(queryVector);

  if (!isHybridRetrievalEnabled()) {
    // Pure-vector path — byte-identical to v0.5.13 behaviour. The
    // `HYBRID_RETRIEVAL_ENABLED` flag-off path is the one that ships
    // by default; the live deploy keeps producing stable
    // run-to-run-comparable retrieval until an operator flips the
    // flag and a calibration run (ideally with the --judge mode from
    // ADR-0062) measures the hybrid lift.
    const rows = await retrieveVector({
      vec,
      candidatePool: k,
      workspaceId: opts.workspaceId,
    });
    return rows.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      ordinal: Number(r.ordinal),
      content: r.content,
      distance: Number(r.distance),
    }));
  }

  // Hybrid path. Both lists return up to 2K candidates; the fused
  // top-K is then materialised back from the union of returned rows.
  const candidatePool = k * HYBRID_CANDIDATE_MULTIPLIER;
  const [vectorRows, lexicalRows] = await Promise.all([
    retrieveVector({ vec, candidatePool, workspaceId: opts.workspaceId }),
    retrieveLexical({
      question: trimmed,
      candidatePool,
      workspaceId: opts.workspaceId,
    }),
  ]);

  const fused = fuseRRF(
    [
      { name: "vector", items: vectorRows.map((r) => ({ id: r.chunkId })) },
      { name: "lexical", items: lexicalRows.map((r) => ({ id: r.chunkId })) },
    ],
    { limit: k },
  );

  // Materialise: for each fused id, prefer the vector row (it carries
  // the meaningful cosine distance); fall back to the lexical row when
  // the chunk was surfaced only by FTS.
  const vectorById = new Map(vectorRows.map((r) => [r.chunkId, r]));
  const lexicalById = new Map(lexicalRows.map((r) => [r.chunkId, r]));
  return fused.map((f) => {
    const row = vectorById.get(f.id) ?? lexicalById.get(f.id)!;
    return {
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      ordinal: Number(row.ordinal),
      content: row.content,
      distance: Number(row.distance),
      hybridSources: f.sources,
    };
  });
}
