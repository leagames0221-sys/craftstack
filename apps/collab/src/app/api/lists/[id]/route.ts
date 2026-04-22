import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { deleteList, renameList } from "@/server/list";

/** PATCH /api/lists/:id — rename. */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) {
      throw new BadRequestError("Invalid title", {
        fieldErrors: { title: "must be 1-120 characters" },
      });
    }
    const updated = await renameList(session.user.id, id, title);
    return json(updated);
  },
);

/** DELETE /api/lists/:id — delete (ADMIN+). */
export const DELETE = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    await deleteList(session.user.id, id);
    return new Response(null, { status: 204 });
  },
);
