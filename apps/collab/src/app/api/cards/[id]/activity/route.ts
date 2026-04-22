import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { listCardActivity } from "@/server/activity";

export const GET = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return json(
      await listCardActivity(session.user.id, id, {
        limit: Number.isFinite(limit) ? (limit as number) : undefined,
      }),
    );
  },
);
