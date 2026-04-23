import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";

/**
 * Gemini plumbing for the Knowlex MVP.
 *
 * - Embedder: `gemini-embedding-001`. Google deprecated
 *   `text-embedding-004` on the `v1beta` endpoint that the AI SDK uses,
 *   and `gemini-embedding-001` is the current stable replacement. It
 *   natively produces 3072-dim vectors; we truncate to 768 via the
 *   `outputDimensionality` provider option so the stored column
 *   (`Embedding.embedding vector(768)`) stays compatible without a
 *   re-migration.
 * - Generator: `gemini-2.5-flash` (free tier).
 *
 * Missing `GEMINI_API_KEY` is handled by callers.
 */

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;
export const GENERATION_MODEL = "gemini-2.5-flash";

export function getGemini(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}

export async function embedTexts(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Always go through `embedMany` even for a single value. The AI-SDK's
  // single-value `embed()` and batch `embedMany()` have historically
  // diverged in how they thread `providerOptions` to the underlying
  // Google endpoint; sticking to one path keeps dimensionality
  // guarantees consistent between ingest (batch) and retrieve (single).
  const g = getGemini(apiKey);
  const { embeddings } = await embedMany({
    model: g.textEmbeddingModel(EMBEDDING_MODEL),
    values: texts,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIM },
    },
  });

  // Defend the downstream pgvector column against silent dim drift:
  // if the SDK ever fails to forward `outputDimensionality`, surface it
  // here rather than 0-row retrieves or index corruption.
  for (const v of embeddings) {
    if (v.length !== EMBEDDING_DIM) {
      throw new Error(
        `EMBEDDING_DIM_UNEXPECTED: got ${v.length}, expected ${EMBEDDING_DIM}`,
      );
    }
  }
  return embeddings;
}

/**
 * Render a float[] as the pgvector text literal accepted by `::vector`.
 * Example: [0.1, -0.2, 0.3] → "[0.1,-0.2,0.3]".
 */
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
