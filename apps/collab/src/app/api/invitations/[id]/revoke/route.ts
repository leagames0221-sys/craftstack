import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { revokeInvitation } from "@/server/invitation";

export const POST = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    await revokeInvitation(session.user.id, id);
    return json({ ok: true });
  },
);
