import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";

import {
  emergencyStopResponse,
  isEmergencyStopped,
} from "@/lib/emergency-stop";
import { checkAndIncrementGlobalBudget } from "@/lib/global-budget";
import { buildDemoAnswer, streamStringAsResponse } from "@/lib/kb-demo";
import { checkAndIncrement } from "@/lib/kb-rate-limit";

/**
 * POST /api/kb/ask
 *
 * Knowlex "playground" endpoint. The caller supplies a context blob (their
 * own documents / notes, pasted into the textarea on /playground) and a
 * question; we stream back a Gemini Flash answer grounded *only* in that
 * context. This is the visible slice of Knowlex that runs on the existing
 * collab deploy — the full tenanted / vector-retrieval path lives in
 * apps/knowledge and is tracked as a separate sprint.
 *
 * Guarded by:
 *   - GEMINI_API_KEY env var (missing = 503 with a clear message)
 *   - per-IP sliding-window rate limit (see lib/kb-rate-limit)
 *
 * No auth: the playground is intentionally public so a recruiter can try it
 * without having to sign up.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTEXT_CHARS = 12_000;
const MAX_QUESTION_CHARS = 500;

const bodySchema = z.object({
  context: z.string().trim().min(1).max(MAX_CONTEXT_CHARS),
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

const SYSTEM_PROMPT = `You are a careful knowledge-base assistant.
Answer ONLY using the information in the <context>…</context> block below.
If the context does not contain the answer, say so plainly in one sentence —
do not speculate, do not invent facts, do not fall back on outside knowledge.
Write concisely. Prefer 1–4 short paragraphs. Quote directly when useful,
using inline quotes ("like this") rather than block quotes.`;

export async function POST(req: Request) {
  // Human-driven kill switch — precedes every other check.
  if (isEmergencyStopped()) return emergencyStopResponse();

  const apiKey = process.env.GEMINI_API_KEY;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const limit = checkAndIncrement(ip);
  if (!limit.ok) {
    return Response.json(
      {
        code: "RATE_LIMIT_EXCEEDED",
        message:
          "Too many questions from this address. Please wait a minute and try again.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
        },
      },
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        code: "BAD_REQUEST",
        message:
          "Invalid body — need { context: string, question: string } within length limits.",
      },
      { status: 400 },
    );
  }

  if (!apiKey) {
    // Demo mode: stream a deterministic canned answer so the playground
    // UX is fully demonstrable without a Gemini key. See lib/kb-demo.
    return streamStringAsResponse(
      buildDemoAnswer(parsed.data.context, parsed.data.question),
    );
  }

  // Global invocation budget — defense-in-depth in case GEMINI_API_KEY is
  // ever wired to a billing-enabled Google Cloud project (vs. the
  // recommended free-tier AI Studio key). See COST_SAFETY.md + lib/global-budget.
  const budget = checkAndIncrementGlobalBudget("kb-ask");
  if (!budget.ok) {
    return Response.json(
      {
        code:
          budget.scope === "day"
            ? "BUDGET_EXCEEDED_DAY"
            : "BUDGET_EXCEEDED_MONTH",
        message:
          "This deployment has reached its Gemini invocation budget. Try again later; if you operate this deploy, see COST_SAFETY.md.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(budget.retryAfterSeconds) },
      },
    );
  }

  // The playground uses non-streaming `generateText` rather than
  // `streamText`. Two reasons:
  //  (1) With ~12 KB of user-pasted context + a 600-token ceiling, the
  //      end-to-end response is small and fast enough that streaming
  //      adds complexity without a perceptible UX win.
  //  (2) Under Vercel's Node runtime we saw streamed responses
  //      truncated when the underlying fetch was interrupted by the
  //      platform proxy; `generateText` lets us return a single
  //      text/plain body that's indivisible. The full RAG app in
  //      apps/knowledge uses `streamText` because its answers are
  //      smaller and citation-driven, so the UX benefit is real.
  const google = createGoogleGenerativeAI({ apiKey });
  const model = google("gemini-2.5-flash");

  try {
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `<context>\n${parsed.data.context}\n</context>\n\nQuestion: ${parsed.data.question}`,
        },
      ],
      temperature: 0.2,
      maxOutputTokens: 600,
    });

    if (typeof result.text !== "string" || result.text.length === 0) {
      console.error(
        "[kb-ask] Gemini returned no text",
        result.finishReason,
        result.usage,
      );
      return Response.json(
        {
          code: "EMPTY_ANSWER",
          message: "The model returned no answer. Please retry or rephrase.",
        },
        { status: 502 },
      );
    }

    return new Response(result.text, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-playground-mode": "live",
      },
    });
  } catch (err) {
    console.error("[kb-ask] Gemini call failed:", err);
    return Response.json(
      {
        code: "GENERATION_FAILED",
        message: "The model call failed. Please retry.",
      },
      { status: 502 },
    );
  }
}
