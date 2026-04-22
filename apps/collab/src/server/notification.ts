import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

/**
 * Return recent notifications for the caller. Unread first, then read.
 * We cap the result so a long-inactive user never gets a thousand rows.
 */
export async function listNotifications(
  userId: string,
  options: { limit?: number } = {},
): Promise<NotificationRow[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: [
      { readAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ],
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markRead(
  userId: string,
  notificationId: string,
): Promise<void> {
  // updateMany scopes by userId so a user can't flip someone else's row.
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

/**
 * Best-effort notification creation. Failures log and swallow — the originating
 * business mutation (e.g. posting a comment) must not be aborted because a
 * notification insert hiccupped.
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        payload: input.payload as never,
      },
    });
  } catch (err) {
    console.warn("[notification] create failed", err);
  }
}
