import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { listActivity } from "@/server/activity";

/**
 * GET /api/workspaces/:id/activity?limit=30&cursor=<lastId>
 * Returns the most recent activity entries for the workspace. Any member
 * (VIEWER+) may read. Cursor pagination uses the id of the oldest entry
 * from the previous page.
 */
export const GET = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const rows = await listActivity(session.user.id, id, {
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
      cursor: cursor || undefined,
    });
    return json(rows);
  },
);
