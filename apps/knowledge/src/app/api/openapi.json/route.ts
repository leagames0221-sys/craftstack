import { openApiSpec } from "@/openapi";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /api/openapi.json
 *
 * Public, cached, unauthenticated. Third-party docs tools can point
 * straight at this URL:
 *
 *   https://editor.swagger.io/?url=https://craftstack-knowledge.vercel.app/api/openapi.json
 */
export function GET() {
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
