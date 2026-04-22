import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/errors";

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

export type CreateWorkspaceInput = {
  name: string;
  slug: string;
  color?: string;
};

/**
 * Create a workspace owned by `userId`. The creator is added as OWNER in the
 * same transaction so membership is never missing after creation.
 * Throws ConflictError('SLUG_TAKEN') on slug collision.
 */
export async function createWorkspace(
  userId: string,
  input: CreateWorkspaceInput,
) {
  const existing = await prisma.workspace.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      "SLUG_TAKEN",
      `Workspace slug '${input.slug}' is already taken`,
    );
  }

  return prisma.workspace.create({
    data: {
      name: input.name,
      slug: input.slug,
      color: input.color ?? "#4F46E5",
      ownerId: userId,
      memberships: {
        create: { userId, role: "OWNER" },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      iconUrl: true,
    },
  });
}
