/**
 * Emergency stop — mirror of apps/knowledge/src/lib/emergency-stop.ts.
 *
 * Wired into the collab playground's `/api/kb/ask` only. Does NOT
 * cover the rest of the collab write surface (cards, lists, comments,
 * invitations, workspaces) — see ADR-0046 § Trade-offs for the
 * deliberate scope narrowing. For a DB-outage write freeze, use
 * `READ_ONLY=1` (runbook § 1).
 *
 * A single `EMERGENCY_STOP=1` env flag disables the Gemini-consuming
 * paths across both apps without a redeploy. Stays as a copy (not a
 * shared package) per ADR-0043's "copy-don't-package-yet" stance;
 * promotion happens when a third caller appears.
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
        "This deployment is in emergency-stop mode. Write and AI endpoints are disabled. Operators: see docs/ops/runbook.md § Emergency stop.",
    },
    {
      status: 503,
      headers: { "Retry-After": "3600", "cache-control": "no-store" },
    },
  );
}
