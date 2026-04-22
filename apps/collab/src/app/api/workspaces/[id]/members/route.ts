import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { prisma } from "@/lib/db";

/**
 * GET /api/workspaces/:id/members
 * Return the member list of a workspace the caller belongs to. Used by the
 * card-modal assignees picker. VIEWER is enough since the same info is
 * already visible on the workspace page.
 */
export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;

    const ws = await prisma.workspace.findFirst({
      where: { id, deletedAt: null },
      include: {
        memberships: {
          where: { userId: session.user.id },
          select: { role: true },
        },
      },
    });
    if (!ws) throw new NotFoundError("Workspace");
    if (ws.memberships.length === 0) {
      throw new ForbiddenError("MEMBERS_READ_DENIED");
    }

    const rows = await prisma.membership.findMany({
      where: { workspaceId: id },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    return json(
      rows.map((r) => ({
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        image: r.user.image,
      })),
    );
  },
);
