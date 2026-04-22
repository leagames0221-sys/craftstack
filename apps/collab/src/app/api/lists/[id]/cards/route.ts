import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { createCard } from "@/server/card";

/** POST /api/lists/:id/cards — append a card. */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      description?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description : undefined;
    if (!title || title.length > 200) {
      throw new BadRequestError("Invalid card title", {
        fieldErrors: { title: "must be 1-200 characters" },
      });
    }

    const created = await createCard(session.user.id, id, {
      title,
      description,
    });
    return json(created, { status: 201 });
  },
);
