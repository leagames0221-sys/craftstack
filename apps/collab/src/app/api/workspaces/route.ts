import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { listWorkspacesForUser } from "@/server/workspace";

/**
 * GET /api/workspaces
 * Returns every workspace the authenticated user is a member of.
 * Spec: docs/design/06_openapi_specs.md
 */
export const GET = handle(async () => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  const workspaces = await listWorkspacesForUser(session.user.id);
  return json(workspaces);
});
