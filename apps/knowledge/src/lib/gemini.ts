import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany, embed as embedOne } from "ai";

/**
 * Gemini plumbing for the Knowlex MVP.
 *
 * - Embedder: `gemini-embedding-001`. Google deprecated
 *   `text-embedding-004` on the `v1beta` endpoint that the AI SDK uses,
 *   and `gemini-embedding-001` is the current stable replacement. It
 *   natively produces 3072-dim vectors; we truncate to 768 via the
 *   `outputDimensionality` provider option so the existing pgvector
 *   schema (Embedding.vector(768)) stays compatible without a
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
  const g = getGemini(apiKey);
  const model = g.textEmbeddingModel(EMBEDDING_MODEL);
  // Request 768-dim output so the stored vectors match the pgvector
  // column. Google's REST param name is `outputDimensionality`; the AI
  // SDK forwards provider-specific options via `providerOptions`.
  const providerOptions = {
    google: { outputDimensionality: EMBEDDING_DIM },
  };
  if (texts.length === 1) {
    const { embedding } = await embedOne({
      model,
      value: texts[0],
      providerOptions,
    });
    return [embedding];
  }
  const { embeddings } = await embedMany({
    model,
    values: texts,
    providerOptions,
  });
  return embeddings;
}

/**
 * Render a float[] as the pgvector text literal accepted by `::vector`.
 * Example: [0.1, -0.2, 0.3] → "[0.1,-0.2,0.3]".
 */
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
