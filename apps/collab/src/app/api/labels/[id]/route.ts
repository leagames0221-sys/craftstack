import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { deleteLabel, updateLabel } from "@/server/label";

export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      color?: unknown;
    };
    const input: { name?: string; color?: string } = {};
    if (typeof body.name === "string") input.name = body.name;
    if (typeof body.color === "string") input.color = body.color;
    return json(await updateLabel(session.user.id, id, input));
  },
);

export const DELETE = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    await deleteLabel(session.user.id, id);
    return json({ ok: true });
  },
);
