import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { parseCreateWorkspaceInput } from "@/lib/validation";
import { createWorkspace, listWorkspacesForUser } from "@/server/workspace";

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

/**
 * POST /api/workspaces
 * Creates a workspace with the caller added as OWNER.
 * 400 BAD_REQUEST on validation, 409 SLUG_TAKEN on collision.
 */
export const POST = handle(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  const body = await req.json().catch(() => null);
  const input = parseCreateWorkspaceInput(body);
  const created = await createWorkspace(session.user.id, input);
  return json(created, { status: 201 });
});
