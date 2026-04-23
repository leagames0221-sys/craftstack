import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { RateLimitError, UnauthorizedError } from "@/lib/errors";
import { checkUserLimit } from "@/lib/user-rate-limit";
import { listNotifications, unreadCount } from "@/server/notification";

/**
 * GET /api/notifications?limit=30
 * Returns { rows, unread } so a single poll from the bell UI gets both
 * pieces of state at once.
 */
export const GET = handle(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  // The bell polls every 30s; 30 req/minute is ~15x normal headroom.
  const rl = checkUserLimit("notifications", session.user.id, 60_000, 30);
  if (!rl.ok) {
    throw new RateLimitError(
      "NOTIFICATIONS_RATE_LIMITED",
      `Too many notification polls. Retry in ${rl.retryAfterSeconds}s.`,
    );
  }

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
