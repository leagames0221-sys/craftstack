/**
 * Emergency stop — a single env-flag kill switch that disables the
 * **Gemini-consuming** endpoints without requiring a redeploy.
 *
 * Scope (important — see ADR-0046 § Trade-offs):
 *   - Covers: /api/kb/ask, /api/kb/ingest (knowledge app);
 *             /api/kb/ask (collab playground).
 *   - Does NOT cover: the 20+ non-AI Boardly write endpoints (cards,
 *     lists, comments, invitations, workspaces). Those are bounded by
 *     their own cost layers (Resend 3-tier invitation cap, Neon
 *     auto-suspend, Vercel function-hour refuse) and don't spend
 *     Gemini quota, so a Gemini-key abuse event shouldn't block them.
 *   - For a DB-outage scenario that needs an app-wide write freeze,
 *     use `READ_ONLY=1` instead (runbook § 1, separate flag by
 *     design).
 *
 * Purpose: bound the worst-case operator response time for a suspected
 * Gemini key leak or runaway AI traffic. Setting `EMERGENCY_STOP=1`
 * in Vercel's project env and redeploying is the official path; the
 * value is read per-request so a Vercel "Instant Rollback" or env
 * toggle takes effect on the next request without a fresh build.
 *
 * This sits in front of the per-IP rate limiter and the global
 * budget, because those are defensive caps — emergency stop is a
 * human-driven off switch. Read endpoints (GET /api/kb/stats, and
 * GET /api/kb/budget when `ENABLE_OBSERVABILITY_API=1`) stay live by
 * design so operators can still observe state.
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
