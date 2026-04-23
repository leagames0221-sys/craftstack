import { openApiSpec } from "@/openapi";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /api/openapi.json
 *
 * Public, cached, unauthenticated. Point Swagger Editor / Scalar /
 * Stoplight / ReDoc at this URL — the shape is the contract:
 *
 *   https://editor.swagger.io/?url=https://craftstack-collab.vercel.app/api/openapi.json
 */
export function GET() {
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Browsers and proxies may cache the spec freely; it's regenerated
      // on every deploy via `force-static`.
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
