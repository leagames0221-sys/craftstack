import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Role hierarchy:  OWNER > ADMIN > EDITOR > VIEWER
 * Higher numeric rank = more powerful.
 */
const RANK: Record<Role, number> = {
  OWNER: 3,
  ADMIN: 2,
  EDITOR: 1,
  VIEWER: 0,
};

/** True iff `actual` meets or exceeds `required`. */
export function roleAtLeast(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

/** True iff `userId` has any membership in `workspaceId` with role >= `required`. */
export async function hasRole(
  userId: string,
  workspaceId: string,
  required: Role,
): Promise<boolean> {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  return !!m && roleAtLeast(m.role, required);
}

export class RoleError extends Error {
  constructor(
    public readonly required: Role,
    public readonly actual: Role | null,
  ) {
    super(`Role insufficient: needed ${required}, got ${actual ?? "NONE"}`);
    this.name = "RoleError";
  }
}

/** Throws `RoleError` if the user does not have the required role. */
export async function requireRole(
  userId: string,
  workspaceId: string,
  required: Role,
): Promise<Role> {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  if (!m || !roleAtLeast(m.role, required)) {
    throw new RoleError(required, m?.role ?? null);
  }
  return m.role;
}
