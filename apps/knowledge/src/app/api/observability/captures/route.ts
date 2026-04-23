import { recentCaptures } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/observability/captures
 *
 * Exposes the in-memory ring buffer from `lib/observability` so a
 * reviewer can verify the error-capture pipeline end-to-end without
 * signing up for Sentry. When a real Sentry DSN is configured, each
 * capture is *also* forwarded upstream — the two backends are
 * complementary, not exclusive, so this endpoint doubles as a "last
 * N errors" local tail even with Sentry fully wired.
 *
 * Gated: only served outside production *unless* the operator opts
 * in with `ENABLE_OBSERVABILITY_API=1`. Production default is closed
 * because the ring is per-container and only useful for local /
 * preview debugging; exposing it on the public live deploy would
 * leak server-side error text to the internet.
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
