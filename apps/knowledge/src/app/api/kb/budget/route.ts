import { isEmergencyStopped } from "@/lib/emergency-stop";
import { snapshotBudget } from "@/lib/global-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BudgetPayload = {
  generatedAt: string;
  ask: ReturnType<typeof snapshotBudget>;
  ingest: ReturnType<typeof snapshotBudget>;
  emergencyStop: boolean;
};

/**
 * GET /api/kb/budget — cost-safety observability surface.
 *
 * Companion to /api/kb/stats. Exposes the current used/cap state of
 * both global-budget namespaces (`kb-ask`, `kb-ingest`) plus the
 * emergency-stop flag. Cheap, read-only, no Gemini calls.
 *
 * **Gated** behind `ENABLE_OBSERVABILITY_API=1` in production, mirror-
 * ing /api/observability/captures. Rationale: the `used / cap` ratio
 * is tactical attack intelligence — an attacker who sees `day.used:
 * 795/800` can time a follow-up flood to tip the container into the
 * 429 state for the remainder of the day. Keeping the endpoint open
 * by default leaks that advantage for free. Operators who want
 * UptimeRobot / dashboard integration set the env flag on their
 * Vercel project and get the observability back; the default stance
 * stays closed.
 *
 * Counter state is per-warm-container; on Vercel serverless the cap is
 * enforced per instance, not globally across the fleet. See
 * global-budget.ts for the trade-off rationale.
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
          "Budget observability API is disabled in production. Set ENABLE_OBSERVABILITY_API=1 on the server to open it. See ADR-0046 § Trade-offs for rationale.",
      },
      { status: 404 },
    );
  }

  const payload: BudgetPayload = {
    generatedAt: new Date().toISOString(),
    ask: snapshotBudget("kb-ask"),
    ingest: snapshotBudget("kb-ingest"),
    emergencyStop: isEmergencyStopped(),
  };

  return Response.json(payload, {
    headers: { "cache-control": "no-store" },
  });
}
