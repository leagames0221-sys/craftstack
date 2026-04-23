import { z } from "zod";

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

  try {
    const result = await ingestDocument({
      apiKey,
      title: parsed.data.title,
      content: parsed.data.content,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const code = (err as Error).message || "INGEST_FAILED";
    // eslint-disable-next-line no-console
    console.error("[ingest] failed", err);
    return Response.json(
      { code, message: `Ingest failed: ${code}` },
      { status: 500 },
    );
  }
}
