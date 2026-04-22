import { NextResponse } from "next/server";

/**
 * Health endpoint used by UptimeRobot to keep the Neon free-tier DB warm
 * and to surface liveness in the Better Stack dashboard (ADR-0016).
 *
 * Stays cheap on purpose: does not touch the database. A deep `/api/ready`
 * probe will land when the DB is wired up.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "boardly",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
