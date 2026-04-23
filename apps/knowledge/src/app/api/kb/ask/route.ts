import { streamText } from "ai";
import { z } from "zod";

import { GENERATION_MODEL, getGemini } from "@/lib/gemini";
import { buildUserMessage, RAG_SYSTEM_PROMPT } from "@/server/rag-prompt";
import { retrieveTopK } from "@/server/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  k: z.number().int().min(1).max(16).optional(),
});

/**
 * POST /api/kb/ask — RAG pipeline.
 *
 *   1. Embed the question.
 *   2. pgvector cosine kNN against stored Chunk embeddings.
 *   3. Assemble a numbered-citation prompt.
 *   4. Stream Gemini 2.0 Flash.
 *
 * Response headers include `x-knowlex-hits` (count) and `x-knowlex-docs`
 * (comma-separated document titles) so the client can render a
 * citations panel without a second round-trip.
 */
export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        code: "GEMINI_NOT_CONFIGURED",
        message:
          "Set GEMINI_API_KEY to enable RAG. The corpus stays intact — no ingest is lost when the key is missing.",
      },
      { status: 503 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { code: "BAD_REQUEST", message: "Body must be { question, k? }." },
      { status: 400 },
    );
  }

  const hits = await retrieveTopK({
    apiKey,
    question: parsed.data.question,
    k: parsed.data.k,
  });

  const google = getGemini(apiKey);
  const result = streamText({
    model: google(GENERATION_MODEL),
    system: RAG_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(parsed.data.question, hits),
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 600,
  });

  const docTitles = [...new Set(hits.map((h) => h.documentTitle))].join("|");

  return result.toTextStreamResponse({
    headers: {
      "x-knowlex-hits": String(hits.length),
      "x-knowlex-docs": docTitles,
    },
  });
}
