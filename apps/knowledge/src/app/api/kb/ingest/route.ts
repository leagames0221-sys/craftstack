import { z } from "zod";

import { checkAndIncrementGlobalBudget } from "@/lib/global-budget";
import { checkAndIncrement } from "@/lib/kb-rate-limit";
import { ingestDocument } from "@/server/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
});

/**
 * POST /api/kb/ingest — chunk + embed + store a pasted document.
 *
 * Env-guarded: missing GEMINI_API_KEY → 503 with a clear message.
 * Returns { documentId, chunks }.
 */
export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        code: "GEMINI_NOT_CONFIGURED",
        message:
          "Set GEMINI_API_KEY (get a free key at https://aistudio.google.com/app/apikey) to enable ingestion.",
      },
      { status: 503 },
    );
  }

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
          "Too many ingests from this address. Please wait a minute and try again.",
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
      {
        code: "BAD_REQUEST",
        message:
          "Body must be { title: string (1-200), content: string (1-50000) }.",
      },
      { status: 400 },
    );
  }

  const budget = checkAndIncrementGlobalBudget("kb-ingest");
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

  try {
    const result = await ingestDocument({
      apiKey,
      title: parsed.data.title,
      content: parsed.data.content,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const code = (err as Error).message || "INGEST_FAILED";
    console.error("[ingest] failed", err);
    return Response.json(
      { code, message: `Ingest failed: ${code}` },
      { status: 500 },
    );
  }
}
