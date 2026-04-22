import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { deleteList, updateList } from "@/server/list";

/** PATCH /api/lists/:id — update title and/or wipLimit. */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      wipLimit?: unknown;
    };
    const input: { title?: string; wipLimit?: number | null } = {};
    if (typeof body.title === "string") input.title = body.title;
    if (body.wipLimit === null) input.wipLimit = null;
    else if (typeof body.wipLimit === "number") input.wipLimit = body.wipLimit;
    else if (body.wipLimit !== undefined) {
      throw new BadRequestError("Invalid wipLimit", {
        fieldErrors: { wipLimit: "must be number or null" },
      });
    }
    const updated = await updateList(session.user.id, id, input);
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
