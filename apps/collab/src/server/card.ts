import type { Card } from "@prisma/client";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { between, first } from "@/lib/lexorank";

/**
 * Create a card at the end of the given list.
 */
export async function createCard(
  userId: string,
  listId: string,
  input: { title: string; description?: string },
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
      cards: {
        orderBy: { position: "desc" },
        take: 1,
        select: { position: true },
      },
    },
  });
  if (!list) throw new NotFoundError("List");
  const role = list.board.workspace.memberships[0]?.role;
  if (!role || !roleAtLeast(role, "EDITOR")) {
    throw new ForbiddenError("CARD_CREATE_DENIED");
  }

  const prevTail = list.cards[0]?.position;
  const position = prevTail ? between(prevTail, null) : first();

  return prisma.card.create({
    data: {
      listId,
      title: input.title,
      description: input.description ?? null,
      position,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      version: true,
    },
  });
}

/**
 * Update title / description using optimistic lock on `version`.
 * Throws ConflictError('VERSION_MISMATCH') if the client-supplied version
 * no longer matches the row's current version.
 */
export async function updateCard(
  userId: string,
  cardId: string,
  input: {
    version: number;
    title?: string;
    description?: string | null;
    dueDate?: Date | null;
  },
): Promise<Card> {
  await assertCardRole(userId, cardId, "EDITOR");

  // Atomic "check and bump version". If the version doesn't match, 0 rows
  // update and we raise ConflictError so the client can re-fetch + merge.
  const result = await prisma.card.updateMany({
    where: { id: cardId, version: input.version },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      version: { increment: 1 },
    },
  });

  if (result.count === 0) {
    const current = await prisma.card.findUnique({ where: { id: cardId } });
    throw new ConflictError("VERSION_MISMATCH", "Card version is stale", {
      currentVersion: current?.version ?? null,
      suppliedVersion: input.version,
    });
  }

  return await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
}

/**
 * Move a card to a (possibly new) list and position using the same optimistic
 * lock mechanism. The caller supplies the ids of the neighbors after the move
 * so the server can compute the LexoRank position without a round trip.
 */
export async function moveCard(
  userId: string,
  cardId: string,
  input: {
    version: number;
    listId: string;
    beforeId?: string | null;
    afterId?: string | null;
  },
): Promise<Card> {
  await assertCardRole(userId, cardId, "EDITOR");
  // Validate the destination list lives in the same workspace (defense in
  // depth; avoids cards being hijacked into another workspace's list).
  const [current, destList] = await Promise.all([
    prisma.card.findUnique({
      where: { id: cardId },
      include: {
        list: { select: { board: { select: { workspaceId: true } } } },
      },
    }),
    prisma.list.findUnique({
      where: { id: input.listId },
      include: { board: { select: { workspaceId: true } } },
    }),
  ]);
  if (!current) throw new NotFoundError("Card");
  if (!destList) throw new NotFoundError("List");
  if (current.list.board.workspaceId !== destList.board.workspaceId) {
    throw new ForbiddenError("CROSS_WORKSPACE_MOVE_DENIED");
  }

  const [before, after] = await Promise.all([
    input.beforeId
      ? prisma.card.findUnique({
          where: { id: input.beforeId },
          select: { position: true },
        })
      : Promise.resolve(null),
    input.afterId
      ? prisma.card.findUnique({
          where: { id: input.afterId },
          select: { position: true },
        })
      : Promise.resolve(null),
  ]);

  const position = between(before?.position ?? null, after?.position ?? null);

  const result = await prisma.card.updateMany({
    where: { id: cardId, version: input.version },
    data: {
      listId: input.listId,
      position,
      version: { increment: 1 },
    },
  });

  if (result.count === 0) {
    const fresh = await prisma.card.findUnique({ where: { id: cardId } });
    throw new ConflictError("VERSION_MISMATCH", "Card version is stale", {
      currentVersion: fresh?.version ?? null,
      suppliedVersion: input.version,
    });
  }

  return await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
}

/**
 * Delete a card (EDITOR+).
 */
export async function deleteCard(userId: string, cardId: string) {
  await assertCardRole(userId, cardId, "EDITOR");
  await prisma.card.delete({ where: { id: cardId } });
}

async function assertCardRole(
  userId: string,
  cardId: string,
  required: "EDITOR" | "ADMIN" | "OWNER",
) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      list: {
        include: {
          board: {
            include: {
              workspace: {
                include: {
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
  if (!role || !roleAtLeast(role, required)) {
    throw new ForbiddenError("CARD_OP_DENIED");
  }
}
