import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { moveCard } from "@/server/card";

/**
 * POST /api/cards/:id/move — relocate a card to a new list / position.
 * Uses the same optimistic lock (`version`) as PATCH.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      version?: unknown;
      listId?: unknown;
      beforeId?: unknown;
      afterId?: unknown;
    };

    const errors: Record<string, string> = {};
    const version =
      typeof body.version === "number" && Number.isInteger(body.version)
        ? body.version
        : ((errors.version = "must be an integer"), undefined);
    const listId = typeof body.listId === "string" ? body.listId : undefined;
    if (!listId) errors.listId = "required";

    const beforeId =
      body.beforeId === null || body.beforeId === undefined
        ? null
        : typeof body.beforeId === "string"
          ? body.beforeId
          : ((errors.beforeId = "must be string or null"), null);
    const afterId =
      body.afterId === null || body.afterId === undefined
        ? null
        : typeof body.afterId === "string"
          ? body.afterId
          : ((errors.afterId = "must be string or null"), null);

    if (Object.keys(errors).length > 0) {
      throw new BadRequestError("Invalid body", { fieldErrors: errors });
    }

    const updated = await moveCard(session.user.id, id, {
      version: version!,
      listId: listId!,
      beforeId,
      afterId,
    });
    return json(updated);
  },
);
