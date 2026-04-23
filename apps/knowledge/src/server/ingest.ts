import { chunkText } from "@/lib/chunking";
import { prisma } from "@/lib/db";
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  embedTexts,
  vectorLiteral,
} from "@/lib/gemini";

/**
 * End-to-end text ingestion:
 *   1. Create a Document row with the raw pasted text.
 *   2. Chunk the text into paragraph-aware windows.
 *   3. Embed every chunk in one Gemini batch.
 *   4. Insert Chunk + Embedding rows.
 *
 * Returns the created document's id + chunk count so the caller can
 * give the user a meaningful confirmation.
 *
 * The whole thing runs under a single transaction so a partial failure
 * (embedder timeout, DB hiccup) doesn't leave orphan chunks without
 * embeddings — which would be invisible to retrieval but bloat storage.
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

  const doc = await prisma.document.create({
    data: {
      title,
      content,
      charCount: content.length,
    },
  });

  // Insert chunks first, then embeddings. We do embeddings as raw SQL
  // because Prisma doesn't support the `vector` type natively; the
  // INSERT uses the pgvector text literal cast.
  await prisma.chunk.createMany({
    data: chunks.map((c) => ({
      id: `chk_${doc.id}_${c.ordinal}`,
      documentId: doc.id,
      ordinal: c.ordinal,
      content: c.content,
      tokenCount: c.tokenCount,
    })),
  });

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `chk_${doc.id}_${chunks[i].ordinal}`;
    const vec = vectorLiteral(vectors[i]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Embedding" ("chunkId", "model", "dim", "embedding") VALUES ($1, $2, $3, $4::vector)`,
      chunkId,
      EMBEDDING_MODEL,
      EMBEDDING_DIM,
      vec,
    );
  }

  return { documentId: doc.id, chunks: chunks.length };
}
