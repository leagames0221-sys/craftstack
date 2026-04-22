import { prisma } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { last } from "@/lib/lexorank";
import { roleAtLeast } from "@/auth/rbac";
import type { Role } from "@prisma/client";

/**
 * Create a board inside a workspace, placed at the bottom of the list.
 * Enforces role >= EDITOR at the application layer.
 */
export async function createBoard(
  userId: string,
  slug: string,
  input: { title: string; color?: string },
) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug, deletedAt: null },
    include: {
      memberships: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  if (!workspace) throw new NotFoundError("Workspace");
  const membership = workspace.memberships[0];
  if (!membership || !roleAtLeast(membership.role, "EDITOR" as Role)) {
    throw new ForbiddenError("BOARD_CREATE_DENIED");
  }

  return prisma.board.create({
    data: {
      workspaceId: workspace.id,
      title: input.title,
      color: input.color ?? "#6366F1",
      position: last(),
    },
    select: { id: true, title: true, color: true },
  });
}
