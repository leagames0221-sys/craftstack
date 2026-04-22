import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { broadcastBoard } from "@/lib/pusher";
import { logActivity } from "./activity";

const MAX_BODY_LEN = 4000;

/**
 * Fetch comments for a card in chronological order. Any member of the
 * surrounding workspace may read; VIEWER is fine.
 */
export async function listComments(userId: string, cardId: string) {
  await assertCardReader(userId, cardId);
  return prisma.comment.findMany({
    where: { cardId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      author: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });
}

/**
 * Post a new comment on a card (EDITOR+). The body is trimmed and length-
 * checked; empty or oversized payloads reject with 400.
 */
export async function createComment(
  userId: string,
  cardId: string,
  input: { body: string },
) {
  const body = input.body.trim();
  if (!body) {
    throw new BadRequestError("Body is required", {
      fieldErrors: { body: "required" },
    });
  }
  if (body.length > MAX_BODY_LEN) {
    throw new BadRequestError("Body is too long", {
      fieldErrors: { body: `max ${MAX_BODY_LEN} chars` },
    });
  }

  const card = await assertCardEditor(userId, cardId);

  const comment = await prisma.comment.create({
    data: { cardId, authorId: userId, body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      author: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  await broadcastBoard(
    card.list.boardId,
    // card.moved/created/updated already exist; piggy-back on card.updated so
    // clients that already subscribe get a free refresh signal without needing
    // a new event type. The accompanying payload includes cardId so clients
    // can be smarter later if we decide to scope refreshes.
    { kind: "card.updated", listId: card.listId, cardId },
    userId,
  );
  await logActivity({
    workspaceId: card.list.board.workspaceId,
    actorId: userId,
    action: "COMMENT_CREATED",
    entityType: "Comment",
    entityId: comment.id,
    payload: { cardId, excerpt: body.slice(0, 120) },
  });

  return comment;
}

/**
 * Soft-delete a comment. Anyone may delete their own; ADMIN+ may delete
 * someone else's (e.g. moderation).
 */
export async function deleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      card: {
        select: {
          id: true,
          listId: true,
          list: {
            select: {
              boardId: true,
              board: {
                select: {
                  workspaceId: true,
                  workspace: {
                    select: {
                      memberships: {
                        where: { userId },
                        select: { role: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!comment || comment.deletedAt) throw new NotFoundError("Comment");

  const role = comment.card.list.board.workspace.memberships[0]?.role;
  if (!role) throw new ForbiddenError("COMMENT_DELETE_DENIED");

  const isAuthor = comment.authorId === userId;
  const isAdmin = roleAtLeast(role, "ADMIN");
  if (!isAuthor && !isAdmin) {
    throw new ForbiddenError("COMMENT_DELETE_DENIED");
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  await broadcastBoard(
    comment.card.list.boardId,
    {
      kind: "card.updated",
      listId: comment.card.listId,
      cardId: comment.card.id,
    },
    userId,
  );
  await logActivity({
    workspaceId: comment.card.list.board.workspaceId,
    actorId: userId,
    action: "COMMENT_DELETED",
    entityType: "Comment",
    entityId: commentId,
    payload: { cardId: comment.card.id },
  });
}

async function assertCardReader(userId: string, cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      list: {
        select: {
          boardId: true,
          board: {
            select: {
              workspaceId: true,
              workspace: {
                select: {
                  memberships: {
                    where: { userId },
                    select: { role: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!card) throw new NotFoundError("Card");
  const role = card.list.board.workspace.memberships[0]?.role;
  if (!role) throw new ForbiddenError("CARD_READ_DENIED");
  return card;
}

async function assertCardEditor(userId: string, cardId: string) {
  const card = await assertCardReader(userId, cardId);
  const role = card.list.board.workspace.memberships[0]?.role;
  if (!role || !roleAtLeast(role, "EDITOR")) {
    throw new ForbiddenError("CARD_COMMENT_DENIED");
  }
  return card;
}
