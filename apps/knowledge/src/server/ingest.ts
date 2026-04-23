import { chunkText } from "@/lib/chunking";
import { prisma } from "@/lib/db";
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  embedTexts,
  vectorLiteral,
} from "@/lib/gemini";

/**
 * End-to-end text ingestion for Knowlex.
 *
 * The embedding API call happens up front, outside of any transaction
 * — remote calls inside a Postgres transaction risk holding locks for
 * the duration of a network round-trip. Once we have all vectors in
 * memory, every database write (Document insert + Chunk rows +
 * per-chunk Embedding INSERT) runs inside a single
 * `prisma.$transaction` so a mid-flight DB failure leaves no partial
 * corpus behind.
 *
 * Returns the created document's id + chunk count so the caller can
 * give the user a meaningful confirmation.
 */
export async function ingestDocument(opts: {
  apiKey: string;
  title: string;
  content: string;
}): Promise<{ documentId: string; chunks: number }> {
  const title = opts.title.trim().slice(0, 200) || "Untitled";
  const content = opts.content.trim();
  if (content.length === 0) {
    throw new Error("EMPTY_CONTENT");
  }

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    throw new Error("EMPTY_CONTENT");
  }

  const vectors = await embedTexts(
    opts.apiKey,
    chunks.map((c) => c.content),
  );
  if (vectors.length !== chunks.length) {
    throw new Error(
      `EMBEDDING_COUNT_MISMATCH: got ${vectors.length} for ${chunks.length} chunks`,
    );
  }
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIM) {
      throw new Error(
        `EMBEDDING_DIM_MISMATCH: got ${v.length}, expected ${EMBEDDING_DIM}`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        title,
        content,
        charCount: content.length,
      },
    });

    await tx.chunk.createMany({
      data: chunks.map((c) => ({
        id: `chk_${doc.id}_${c.ordinal}`,
        documentId: doc.id,
        ordinal: c.ordinal,
        content: c.content,
        tokenCount: c.tokenCount,
      })),
    });

    // pgvector's `vector` type isn't a Prisma-native type, so the
    // INSERT has to cast from the text literal produced by
    // `vectorLiteral()`. We serialize the batch so `tx` sees one
    // parameterized statement per chunk; the batch is small (512-char
    // windows → typically < 100 chunks per doc) and stays well under
    // Postgres' statement-count limits.
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `chk_${doc.id}_${chunks[i].ordinal}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "Embedding" ("chunkId", "model", "dim", "embedding") VALUES ($1, $2, $3, $4::vector)`,
        chunkId,
        EMBEDDING_MODEL,
        EMBEDDING_DIM,
        vectorLiteral(vectors[i]),
      );
    }

    return { documentId: doc.id, chunks: chunks.length };
  });
}
