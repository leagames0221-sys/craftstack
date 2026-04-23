import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { RateLimitError, UnauthorizedError } from "@/lib/errors";
import { checkUserLimit } from "@/lib/user-rate-limit";
import { searchForUser } from "@/server/search";

const WINDOW_MS = 60_000;
const CAP = 60; // 1 req/second on average per user — well above normal palette use

/**
 * GET /api/search?q=term
 * Returns workspaces / boards / cards the caller can see whose title matches
 * the query. Empty query returns recent workspaces + boards, which makes the
 * command palette useful as a jump-to even before any typing.
 *
 * Rate-limited per authenticated user (60 req/60s) as belt-and-suspenders:
 * auth already gates this route, but a single signed-in tab should not be
 * able to hammer the Neon-backed query in a tight loop.
 */
export const GET = handle(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  const limit = checkUserLimit("search", session.user.id, WINDOW_MS, CAP);
  if (!limit.ok) {
    throw new RateLimitError(
      "SEARCH_RATE_LIMITED",
      `Too many search requests. Retry in ${limit.retryAfterSeconds}s.`,
    );
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const result = await searchForUser(session.user.id, q);
  return json(result);
});
