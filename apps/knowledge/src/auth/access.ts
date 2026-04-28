import { auth } from "./index";
import { prisma } from "@/lib/db";

/**
 * Workspace-access helpers for Knowlex (ADR-0061).
 *
 * The access-control story has two shapes:
 *
 *   1. **Demo-readable** — anonymous reads against the seeded demo
 *      workspace (`wks_default_v050`) are allowed. This preserves the
 *      live "try the RAG demo without signing up" experience that has
 *      been the Knowlex public surface since v0.3.x. The set of
 *      anonymously-readable workspaces is an explicit allow-list, not
 *      a property of the workspace row itself, so a future "make this
 *      workspace public" feature would land as a deliberate code
 *      change rather than an incidental config flip.
 *
 *   2. **Authed-membership** — every other workspace (= every
 *      user-created workspace) requires the caller to be a Membership
 *      row holder. Reads + writes both gated. This is the closure of
 *      I-01 (single-tenant scope note) per ADR-0061.
 *
 * Writes are NEVER demo-readable: even the demo workspace is read-only
 * for anonymous callers. Authed users CAN ingest into the demo
 * workspace via the `/api/kb/ingest` route guard (an OWNER membership
 * is auto-created on first signin against `wks_default_v050` so a
 * signed-in reviewer can try the full ingest flow on the same demo
 * surface).
 */

/**
 * The seeded demo workspace from the v0.5.0 schema-partitioning
 * migration (ADR-0047 partial). Anonymously readable.
 */
export const DEMO_WORKSPACE_ID = "wks_default_v050";

/**
 * Permission shape returned by `requireDemoOrMember`. Discriminated
 * union so callers can branch on `.kind` without optional chaining.
 */
export type WorkspaceAccess =
  | {
      kind: "anonymous-demo";
      workspaceId: typeof DEMO_WORKSPACE_ID;
      userId: null;
    }
  | {
      kind: "member";
      workspaceId: string;
      userId: string;
    };

/**
 * For READ paths (`/api/kb/ask`, `/api/kb/stats`, `/api/kb/documents`).
 *
 * - Demo workspace: returns `kind: "anonymous-demo"` for any caller
 *   (signed-in or not).
 * - Other workspace: returns `kind: "member"` only if the signed-in
 *   user has a Membership row; throws `WorkspaceAccessError` (403)
 *   otherwise. Anonymous callers also get 403 for non-demo workspaces.
 */
export async function requireDemoOrMember(
  workspaceId: string,
): Promise<WorkspaceAccess> {
  if (workspaceId === DEMO_WORKSPACE_ID) {
    return {
      kind: "anonymous-demo",
      workspaceId: DEMO_WORKSPACE_ID,
      userId: null,
    };
  }
  const session = await auth();
  if (!session?.user?.id) {
    throw new WorkspaceAccessError("UNAUTHENTICATED", 401);
  }
  const member = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: { userId: session.user.id, workspaceId },
    },
    select: { role: true },
  });
  if (!member) {
    throw new WorkspaceAccessError("NOT_A_MEMBER", 403);
  }
  return { kind: "member", workspaceId, userId: session.user.id };
}

/**
 * For WRITE paths (`/api/kb/ingest`, document delete).
 *
 * - Always requires a signed-in session, even for the demo workspace.
 *   Anonymous writes are explicitly disallowed (closes the cost-attack
 *   vector where anyone could fill the demo corpus).
 * - Returns the authed user's id + the verified workspace id. For the
 *   demo workspace, an OWNER membership is auto-created if missing
 *   (so signed-in users can try ingest against the demo without
 *   needing to first create their own workspace).
 */
export async function requireMemberForWrite(
  workspaceId: string,
): Promise<{ userId: string; workspaceId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new WorkspaceAccessError("UNAUTHENTICATED", 401);
  }
  const userId = session.user.id;

  if (workspaceId === DEMO_WORKSPACE_ID) {
    // Auto-grant OWNER membership on the demo workspace for any
    // signed-in user. The demo workspace is intentionally a shared
    // sandbox — granting OWNER is the simplest way to let the user
    // exercise the full ingest flow without requiring a separate
    // "create your own workspace" UX in v0.5.12. v0.6.0+ candidate:
    // a "create personal workspace" CTA + per-user namespace.
    await prisma.membership.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      update: {},
      create: { userId, workspaceId, role: "OWNER" },
    });
    return { userId, workspaceId };
  }

  const member = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  if (!member) {
    throw new WorkspaceAccessError("NOT_A_MEMBER", 403);
  }
  return { userId, workspaceId };
}

export class WorkspaceAccessError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "NOT_A_MEMBER",
    public readonly status: 401 | 403,
  ) {
    super(code);
    this.name = "WorkspaceAccessError";
  }
}
