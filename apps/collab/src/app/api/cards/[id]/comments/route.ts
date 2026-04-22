import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { createComment, listComments } from "@/server/comment";

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    const rows = await listComments(session.user.id, id);
    return json(rows);
  },
);

export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { body?: unknown };
    const text = typeof body.body === "string" ? body.body : "";
    const created = await createComment(session.user.id, id, { body: text });
    return json(created, { status: 201 });
  },
);
