import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { deleteCard, updateCard } from "@/server/card";

/**
 * PATCH /api/cards/:id — update title/description/dueDate with optimistic
 * concurrency control. The request body must include the `version` the
 * client last observed. Server responds 409 VERSION_MISMATCH on conflict.
 */
export const PATCH = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      version?: unknown;
      title?: unknown;
      description?: unknown;
      dueDate?: unknown;
    };

    const errors: Record<string, string> = {};
    const version =
      typeof body.version === "number" && Number.isInteger(body.version)
        ? body.version
        : ((errors.version = "must be an integer"), undefined);

    let title: string | undefined;
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        errors.title = "must be a non-empty string";
      } else if (body.title.length > 200) {
        errors.title = "must be 1-200 characters";
      } else {
        title = body.title.trim();
      }
    }

    let description: string | null | undefined;
    if (body.description !== undefined) {
      if (body.description === null) description = null;
      else if (typeof body.description !== "string") {
        errors.description = "must be a string or null";
      } else description = body.description;
    }

    let dueDate: Date | null | undefined;
    if (body.dueDate !== undefined) {
      if (body.dueDate === null) dueDate = null;
      else if (typeof body.dueDate !== "string") {
        errors.dueDate = "must be an ISO 8601 string or null";
      } else {
        const parsed = new Date(body.dueDate);
        if (Number.isNaN(parsed.getTime())) {
          errors.dueDate = "must be a valid date";
        } else {
          dueDate = parsed;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestError("Invalid body", { fieldErrors: errors });
    }
    if (version === undefined) {
      throw new BadRequestError("Missing version", {
        fieldErrors: { version: "required" },
      });
    }

    const updated = await updateCard(session.user.id, id, {
      version,
      title,
      description,
      dueDate,
    });
    return json(updated);
  },
);

/** DELETE /api/cards/:id — remove the card (EDITOR+). */
export const DELETE = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    await deleteCard(session.user.id, id);
    return new Response(null, { status: 204 });
  },
);
