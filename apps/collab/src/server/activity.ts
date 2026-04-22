import type { ActivityAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/**
 * Append a row to the audit log. Best-effort: errors are swallowed so a
 * failing log insert cannot abort the business mutation that triggered it.
 * Callers pass the acting user, the workspace the activity belongs to, the
 * discriminator action, and a small JSON payload with entity-specific
 * context (title, before/after, etc.). Payloads should be non-sensitive —
 * the log is readable by any workspace member.
 */
export async function logActivity(input: {
  workspaceId: string;
  actorId: string | null;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: (input.payload ?? {}) as never,
      },
    });
  } catch (err) {
    console.warn("[activity] log insert failed", err);
  }
}

export type ActivityFeedEntry = {
  id: string;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
};

/**
 * Page through a workspace's activity feed, newest first. Any member of the
 * workspace may read. The cursor is an activity `id` — callers pass the id
 * of the oldest entry from the previous page to get the next older page.
 */
export async function listActivity(
  userId: string,
  workspaceId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<ActivityFeedEntry[]> {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    include: {
      memberships: { where: { userId }, select: { role: true } },
    },
  });
  if (!ws) throw new NotFoundError("Workspace");
  const role = ws.memberships[0]?.role;
  if (!role || !roleAtLeast(role, "VIEWER")) {
    throw new ForbiddenError("ACTIVITY_READ_DENIED");
  }

  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  const rows = await prisma.activityLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    include: {
      actor: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
    actor: r.actor
      ? {
          id: r.actor.id,
          name: r.actor.name,
          email: r.actor.email,
          image: r.actor.image,
        }
      : null,
  }));
}
