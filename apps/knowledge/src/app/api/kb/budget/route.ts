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
 * emergency-stop flag. Cheap, read-only, no auth, no Gemini calls —
 * safe to probe from anywhere (UptimeRobot, smoke tests, a dashboard).
 *
 * Counter state is per-warm-container; on Vercel serverless the cap is
 * enforced per instance, not globally across the fleet. See
 * global-budget.ts for the trade-off rationale.
 */
export async function GET() {
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
