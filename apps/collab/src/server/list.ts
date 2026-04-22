import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { between, first, last } from "@/lib/lexorank";
import { broadcastBoard } from "@/lib/pusher";
import { logActivity } from "./activity";

/**
 * Create a list at the bottom of the given board.
 * Requires the acting user to be EDITOR or higher on the parent workspace.
 */
export async function createList(
  userId: string,
  boardId: string,
  input: { title: string },
) {
  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    include: {
      workspace: {
        include: {
          memberships: {
            where: { userId },
            select: { role: true },
          },
        },
      },
      lists: {
        orderBy: { position: "desc" },
        take: 1,
        select: { position: true },
      },
    },
  });

  if (!board || board.workspace.deletedAt) throw new NotFoundError("Board");
  const m = board.workspace.memberships[0];
  if (!m || !roleAtLeast(m.role, "EDITOR")) {
    throw new ForbiddenError("LIST_CREATE_DENIED");
  }

  const prevTail = board.lists[0]?.position;
  const position = prevTail ? between(prevTail, null) : first();

  const list = await prisma.list.create({
    data: {
      boardId,
      title: input.title,
      position,
    },
    select: { id: true, boardId: true, title: true, position: true },
  });
  await broadcastBoard(
    boardId,
    { kind: "list.created", listId: list.id },
    userId,
  );
  await logActivity({
    workspaceId: board.workspace.id,
    actorId: userId,
    action: "LIST_CREATED",
    entityType: "List",
    entityId: list.id,
    payload: { title: list.title, boardId },
  });
  return list;
}

/**
 * Rename a list (EDITOR+). Retained for callers that only change the title.
 */
export async function renameList(
  userId: string,
  listId: string,
  title: string,
) {
  return updateList(userId, listId, { title });
}

/**
 * Update a list's title and/or WIP limit.
 *   - title: EDITOR+ may change
 *   - wipLimit: ADMIN+ only (workflow policy, not a routine edit)
 *
 * A single atomic update plus one activity log entry summarizing whichever
 * fields changed. Passing no fields is a 400 — silent no-ops hide bugs.
 */
export async function updateList(
  userId: string,
  listId: string,
  input: { title?: string; wipLimit?: number | null },
): Promise<{ id: string; title: string; wipLimit: number | null }> {
  const data: { title?: string; wipLimit?: number | null } = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title || title.length > 120) {
      throw new BadRequestError("Invalid title", {
        fieldErrors: { title: "must be 1-120 characters" },
      });
    }
    data.title = title;
  }
  if (input.wipLimit !== undefined) {
    if (input.wipLimit !== null) {
      if (!Number.isInteger(input.wipLimit) || input.wipLimit < 1) {
        throw new BadRequestError("Invalid wipLimit", {
          fieldErrors: { wipLimit: "must be a positive integer or null" },
        });
      }
    }
    data.wipLimit = input.wipLimit;
  }
  if (Object.keys(data).length === 0) {
    throw new BadRequestError("Nothing to update");
  }

  // wipLimit changes are a workflow policy decision, not a routine edit;
  // gate them at ADMIN. Title-only edits stay at EDITOR+.
  const required: "EDITOR" | "ADMIN" =
    input.wipLimit !== undefined ? "ADMIN" : "EDITOR";
  const list = await assertListRole(userId, listId, required);

  const result = await prisma.list.update({
    where: { id: listId },
    data,
    select: { id: true, title: true, wipLimit: true },
  });
  await broadcastBoard(list.board.id, { kind: "list.updated", listId }, userId);
  await logActivity({
    workspaceId: list.board.workspaceId,
    actorId: userId,
    action: "LIST_UPDATED",
    entityType: "List",
    entityId: listId,
    payload: {
      title: result.title,
      fields: Object.keys(data),
      ...(data.wipLimit !== undefined ? { wipLimit: data.wipLimit } : {}),
    },
  });
  return {
    id: result.id,
    title: result.title,
    wipLimit: result.wipLimit ?? null,
  };
}

/**
 * Delete a list (ADMIN+ for safety: losing all cards in that list).
 */
export async function deleteList(userId: string, listId: string) {
  const list = await assertListRole(userId, listId, "ADMIN");
  await prisma.list.delete({ where: { id: listId } });
  await broadcastBoard(list.board.id, { kind: "list.deleted", listId }, userId);
  await logActivity({
    workspaceId: list.board.workspaceId,
    actorId: userId,
    action: "LIST_DELETED",
    entityType: "List",
    entityId: listId,
    payload: { title: list.title },
  });
}

async function assertListEditor(userId: string, listId: string) {
  return assertListRole(userId, listId, "EDITOR");
}

export async function assertListRole(
  userId: string,
  listId: string,
  required: "EDITOR" | "ADMIN" | "OWNER",
) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    include: {
      board: {
        include: {
          workspace: {
            include: {
              memberships: { where: { userId }, select: { role: true } },
            },
          },
        },
      },
    },
  });
  if (!list) throw new NotFoundError("List");
  const role = list.board.workspace.memberships[0]?.role;
  if (!role || !roleAtLeast(role, required)) {
    throw new ForbiddenError("LIST_OP_DENIED");
  }
  return list;
}

/**
 * Build a canonical LexoRank position for an insertion relative to existing neighbors.
 * Exposed for API handlers that accept `before` / `after` ids.
 */
export function positionBetween(prev: string | null, next: string | null) {
  if (!prev && !next) return first();
  if (prev && !next) return between(prev, null);
  if (!prev && next) return between(null, next);
  return between(prev!, next!);
}

// Re-export to silence unused imports when only callers need `last`
export { last };
