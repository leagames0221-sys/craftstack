import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { setCardAssignees } from "@/server/assignee";

/**
 * PUT /api/cards/:id/assignees
 * Body: { userIds: string[] } — full replace semantics. New additions get an
 * ASSIGNED notification; removals do not. Returns the resulting assignees.
 */
export const PUT = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      userIds?: unknown;
    };
    if (
      !Array.isArray(body.userIds) ||
      !body.userIds.every((x) => typeof x === "string")
    ) {
      throw new BadRequestError("userIds must be an array of strings");
    }
    return json(
      await setCardAssignees(session.user.id, id, body.userIds as string[]),
    );
  },
);
