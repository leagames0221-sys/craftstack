import { streamText } from "ai";
import { z } from "zod";

import {
  emergencyStopResponse,
  isEmergencyStopped,
} from "@/lib/emergency-stop";
import { GENERATION_MODEL, getGemini } from "@/lib/gemini";
import { checkAndIncrementGlobalBudget } from "@/lib/global-budget";
import { checkAndIncrement } from "@/lib/kb-rate-limit";
import { captureError } from "@/lib/observability";
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
  // Human-driven kill switch — must precede every other check because
  // its purpose is to stop traffic immediately, not negotiate limits.
  if (isEmergencyStopped()) return emergencyStopResponse();

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

  // Cost safety: per-IP window first (cheap, catches the loudest
  // offender), then the global per-container day/month budget as a
  // belt-and-braces cap against key misconfiguration. See
  // COST_SAFETY.md.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const perIp = checkAndIncrement(ip);
  if (!perIp.ok) {
    return Response.json(
      {
        code: "RATE_LIMIT_EXCEEDED",
        message:
          "Too many questions from this address. Please wait a minute and try again.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(perIp.retryAfterSeconds) },
      },
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

  const budget = checkAndIncrementGlobalBudget("kb-ask");
  if (!budget.ok) {
    return Response.json(
      {
        code:
          budget.scope === "day"
            ? "BUDGET_EXCEEDED_DAY"
            : "BUDGET_EXCEEDED_MONTH",
        message:
          "This deployment has reached its Gemini invocation budget. Try again later; operators: see COST_SAFETY.md.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(budget.retryAfterSeconds) },
      },
    );
  }

  let hits;
  try {
    hits = await retrieveTopK({
      apiKey,
      question: parsed.data.question,
      k: parsed.data.k,
    });
  } catch (err) {
    // Log server-side and forward to the observability seam (Sentry
    // when DSN set, in-memory ring otherwise). Never leak stack
    // shape to the caller.
    console.error("[kb-ask] retrieveTopK failed:", err);
    void captureError(err, { route: "/api/kb/ask" });
    return Response.json(
      {
        code: "RETRIEVAL_FAILED",
        message: "Could not search the corpus. Please retry.",
      },
      { status: 500 },
    );
  }

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
