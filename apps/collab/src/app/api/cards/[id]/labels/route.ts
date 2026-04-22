import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { setCardLabels } from "@/server/label";

/**
 * PUT /api/cards/:id/labels
 * Body: { labelIds: string[] } — full replace semantics.
 * Returns the resulting labels attached to the card.
 */
export const PUT = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      labelIds?: unknown;
    };
    if (
      !Array.isArray(body.labelIds) ||
      !body.labelIds.every((x) => typeof x === "string")
    ) {
      throw new BadRequestError("labelIds must be an array of strings");
    }
    return json(
      await setCardLabels(session.user.id, id, body.labelIds as string[]),
    );
  },
);
