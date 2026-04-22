import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { createList } from "@/server/list";

/**
 * POST /api/boards/:id/lists — create a list at the bottom of a board.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) {
      throw new BadRequestError("Invalid list title", {
        fieldErrors: { title: "must be 1-120 characters" },
      });
    }

    const created = await createList(session.user.id, id, { title });
    return json(created, { status: 201 });
  },
);
