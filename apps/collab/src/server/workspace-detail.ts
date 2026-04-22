import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type WorkspaceDetail = {
  id: string;
  name: string;
  slug: string;
  color: string;
  iconUrl: string | null;
  role: Role;
  boards: Array<{
    id: string;
    title: string;
    color: string;
    archived: boolean;
  }>;
  members: Array<{
    userId: string;
    email: string;
    name: string | null;
    image: string | null;
    role: Role;
  }>;
};

/**
 * Load the full workspace-level view a member should see.
 * Returns null if the user is not a member, so the caller can 404 without
 * leaking whether the workspace exists.
 */
export async function loadWorkspaceForMember(
  userId: string,
  slug: string,
): Promise<WorkspaceDetail | null> {
  const row = await prisma.workspace.findFirst({
    where: {
      slug,
      deletedAt: null,
      memberships: { some: { userId } },
    },
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, email: true, name: true, image: true },
          },
        },
      },
      boards: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, title: true, color: true, archived: true },
      },
    },
  });

  if (!row) return null;

  const self = row.memberships.find((m) => m.userId === userId)!;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    iconUrl: row.iconUrl,
    role: self.role,
    boards: row.boards,
    members: row.memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      image: m.user.image,
      role: m.role,
    })),
  };
}
