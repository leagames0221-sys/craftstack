/**
 * Emergency stop — a single env-flag kill switch that disables every
 * write and AI-consuming endpoint without requiring a redeploy.
 *
 * Purpose: bound the worst-case operator response time for a suspected
 * key leak or runaway traffic. Setting `EMERGENCY_STOP=1` in Vercel's
 * project env and redeploying is the official path; the value is read
 * per-request so a Vercel "Instant Rollback" or env toggle takes
 * effect on the next request without a fresh build.
 *
 * This sits in front of the per-IP rate limiter and the global budget,
 * because those are defensive caps — emergency stop is a human-driven
 * off switch. Read endpoints (GET /api/kb/stats, GET /api/kb/budget)
 * stay live by design so operators can still observe state.
 *
 * See docs/ops/runbook.md § Emergency stop.
 */

const FLAG = "EMERGENCY_STOP";

export function isEmergencyStopped(): boolean {
  const raw = process.env[FLAG];
  return raw === "1" || raw === "true";
}

export function emergencyStopResponse(): Response {
  return Response.json(
    {
      code: "EMERGENCY_STOP",
      message:
        "This deployment is in emergency-stop mode. Write and AI endpoints are disabled. Observability endpoints (/api/kb/stats, /api/kb/budget) remain available. Operators: see docs/ops/runbook.md § Emergency stop.",
    },
    {
      status: 503,
      headers: { "Retry-After": "3600", "cache-control": "no-store" },
    },
  );
}
