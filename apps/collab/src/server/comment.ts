import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { broadcastBoard } from "@/lib/pusher";
import { logActivity } from "./activity";
import { extractMentionHandles } from "@/lib/mentions";
import { createNotification } from "./notification";

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

  // Resolve @handles to workspace members and fan out mention + notification
  // rows. Handles match users whose email local-part (before the @) or
  // display name (lowercased, non-word stripped) matches. Authors can never
  // @-notify themselves.
  await fanOutMentions({
    body,
    commentId: comment.id,
    cardId,
    boardId: card.list.boardId,
    workspaceSlug: card.list.board.workspace.slug,
    authorId: userId,
    authorName: comment.author.name ?? comment.author.email,
    workspaceId: card.list.board.workspaceId,
  });

  return comment;
}

async function fanOutMentions(input: {
  body: string;
  commentId: string;
  cardId: string;
  boardId: string;
  workspaceSlug: string;
  authorId: string;
  authorName: string;
  workspaceId: string;
}): Promise<void> {
  const handles = extractMentionHandles(input.body);
  if (handles.length === 0) return;

  // Load workspace members so we can match @handles against them.
  const members = await prisma.membership.findMany({
    where: { workspaceId: input.workspaceId },
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const matched = new Set<string>();
  for (const m of members) {
    if (m.userId === input.authorId) continue;
    const emailLocal = m.user.email.split("@")[0]?.toLowerCase() ?? "";
    const nameHandle = (m.user.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "");
    if (
      handles.includes(emailLocal) ||
      (nameHandle && handles.includes(nameHandle))
    ) {
      matched.add(m.userId);
    }
  }

  if (matched.size === 0) return;

  // Best-effort mention insert. Unique (commentId, userId) — createMany with
  // skipDuplicates handles the (unlikely) double-fire case.
  await prisma.mention
    .createMany({
      data: [...matched].map((userId) => ({
        commentId: input.commentId,
        userId,
      })),
      skipDuplicates: true,
    })
    .catch((err) => {
      console.warn("[mentions] insert failed", err);
    });

  await Promise.all(
    [...matched].map((userId) =>
      createNotification({
        userId,
        type: "MENTION",
        payload: {
          cardId: input.cardId,
          commentId: input.commentId,
          boardId: input.boardId,
          workspaceSlug: input.workspaceSlug,
          actorId: input.authorId,
          actorName: input.authorName,
          excerpt: input.body.slice(0, 160),
          workspaceId: input.workspaceId,
        },
      }),
    ),
  );
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
                  slug: true,
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
