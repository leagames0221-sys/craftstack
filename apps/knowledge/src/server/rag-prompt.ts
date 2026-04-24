import type { RetrievedChunk } from "./retrieve";

export const RAG_SYSTEM_PROMPT = `You are Knowlex, a careful retrieval-augmented
assistant. Answer the user's question using ONLY the numbered <context>
passages below. If the passages don't contain the answer, say so plainly —
don't guess, don't fall back on outside knowledge.

When you cite, use bracketed numbers that refer to the passage index:
  "Boardly uses LexoRank for O(1) card reorders [1]."

Be concise. Prefer 1–4 short paragraphs. Quote short phrases in
"double quotes" rather than pasting whole passages.`.trim();

/**
 * Compose the user message for the generation call. The retrieved chunks
 * are rendered as a numbered list so the model can cite them back with
 * bracket references that map cleanly to the Citation panel in the UI.
 */
export function buildUserMessage(
  question: string,
  chunks: RetrievedChunk[],
): string {
  if (chunks.length === 0) {
    return `<context>
(no retrieval hits)
</context>

Question: ${question}`;
  }

  const body = chunks
    .map(
      (c, i) =>
        `[${i + 1}] "${c.documentTitle}" (chunk ${c.ordinal}):\n${c.content}`,
    )
    .join("\n\n");

  return `<context>
${body}
</context>

Question: ${question}`;
}
