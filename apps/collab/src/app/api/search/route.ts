import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { searchForUser } from "@/server/search";

/**
 * GET /api/search?q=term
 * Returns workspaces / boards / cards the caller can see whose title matches
 * the query. Empty query returns recent workspaces + boards, which makes the
 * command palette useful as a jump-to even before any typing.
 */
export const GET = handle(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const result = await searchForUser(session.user.id, q);
  return json(result);
});
