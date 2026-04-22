import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string;
  color: string;
  iconUrl: string | null;
  role: Role;
};

/**
 * List every active workspace the given user belongs to, along with their role.
 * Soft-deleted workspaces (deletedAt != null) are excluded.
 */
export async function listWorkspacesForUser(
  userId: string,
): Promise<WorkspaceListItem[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      workspace: { deletedAt: null },
    },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          iconUrl: true,
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return memberships.map((m) => ({
    ...m.workspace,
    role: m.role,
  }));
}
