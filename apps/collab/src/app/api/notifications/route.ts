import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { listNotifications, unreadCount } from "@/server/notification";

/**
 * GET /api/notifications?limit=30
 * Returns { rows, unread } so a single poll from the bell UI gets both
 * pieces of state at once.
 */
export const GET = handle(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const [rows, unread] = await Promise.all([
    listNotifications(session.user.id, {
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    }),
    unreadCount(session.user.id),
  ]);
  return json({ rows, unread });
});
