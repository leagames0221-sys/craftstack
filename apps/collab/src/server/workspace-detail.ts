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
  pendingInvitations: Array<{
    id: string;
    email: string;
    role: Role;
    expiresAt: string;
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
  const canSeeInvitations = self.role === "OWNER" || self.role === "ADMIN";
  const pendingInvitations = canSeeInvitations
    ? await prisma.invitation.findMany({
        where: {
          workspaceId: row.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, expiresAt: true },
      })
    : [];

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
    pendingInvitations: pendingInvitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
    })),
  };
}
