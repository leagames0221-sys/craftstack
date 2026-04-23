import { recentCaptures } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/observability/captures
 *
 * See the Knowlex copy of this route for the full rationale. Dev /
 * preview default open; production requires
 * `ENABLE_OBSERVABILITY_API=1` to avoid leaking server-side error
 * text on the public deploy.
 */
export async function GET() {
  const allowed =
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_OBSERVABILITY_API === "1";
  if (!allowed) {
    return Response.json(
      {
        code: "DISABLED",
        message:
          "Observability API is disabled in production. Set ENABLE_OBSERVABILITY_API=1 on the server to open it.",
      },
      { status: 404 },
    );
  }

  const captures = recentCaptures();
  return Response.json(
    {
      count: captures.length,
      backend: captures[0]?.backend ?? "memory",
      captures,
    },
    {
      status: 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
