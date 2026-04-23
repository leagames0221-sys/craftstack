import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany, embed as embedOne } from "ai";

/**
 * Gemini plumbing for the Knowlex MVP.
 *
 * - Embedder: `text-embedding-004` (768-dim, free tier).
 * - Generator: `gemini-2.0-flash` (free tier).
 *
 * Missing `GEMINI_API_KEY` is handled by callers (see env-guard in the
 * route handlers) — this module just returns a provider builder.
 */

export const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIM = 768;
export const GENERATION_MODEL = "gemini-2.0-flash";

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
  if (texts.length === 1) {
    const { embedding } = await embedOne({ model, value: texts[0] });
    return [embedding];
  }
  const { embeddings } = await embedMany({ model, values: texts });
  return embeddings;
}

/**
 * Render a float[] as the pgvector text literal accepted by `::vector`.
 * Example: [0.1, -0.2, 0.3] → "[0.1,-0.2,0.3]".
 */
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
