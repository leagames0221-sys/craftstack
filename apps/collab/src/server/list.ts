import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
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
 * Rename a list (EDITOR+).
 */
export async function renameList(
  userId: string,
  listId: string,
  title: string,
) {
  const list = await assertListEditor(userId, listId);
  const result = await prisma.list.update({
    where: { id: listId },
    data: { title },
    select: { id: true, title: true },
  });
  await broadcastBoard(list.board.id, { kind: "list.updated", listId }, userId);
  await logActivity({
    workspaceId: list.board.workspaceId,
    actorId: userId,
    action: "LIST_UPDATED",
    entityType: "List",
    entityId: listId,
    payload: { title: result.title },
  });
  return result;
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

async function assertListRole(
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
