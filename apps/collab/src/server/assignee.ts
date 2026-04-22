import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { broadcastBoard } from "@/lib/pusher";
import { logActivity } from "./activity";
import { createNotification } from "./notification";

export type AssigneeRow = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
};

/**
 * Replace the assignee set on a card. EDITOR+ may set any combination of
 * workspace members; the caller is never blocked from assigning themselves.
 * Newly-added users receive an ASSIGNED notification with enough context to
 * deep-link back to the card. Removing an assignee does NOT notify the
 * removed user — keeping the notification surface calm.
 */
export async function setCardAssignees(
  userId: string,
  cardId: string,
  userIds: string[],
): Promise<AssigneeRow[]> {
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
      assignees: { select: { userId: true } },
    },
  });
  if (!card) throw new NotFoundError("Card");
  const role = card.list.board.workspace.memberships[0]?.role;
  if (!role || !roleAtLeast(role, "EDITOR")) {
    throw new ForbiddenError("CARD_ASSIGN_DENIED");
  }

  const desired = Array.from(new Set(userIds));

  // Every target id must be a member of this workspace — defense in depth so
  // a malicious client can't leak membership state across tenants by probing
  // user ids.
  if (desired.length > 0) {
    const count = await prisma.membership.count({
      where: {
        userId: { in: desired },
        workspaceId: card.list.board.workspaceId,
      },
    });
    if (count !== desired.length) {
      throw new BadRequestError("Unknown or non-member user id");
    }
  }

  const current = new Set(card.assignees.map((a) => a.userId));
  const desiredSet = new Set(desired);
  const toAdd = [...desiredSet].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desiredSet.has(id));

  await prisma.$transaction([
    ...(toRemove.length > 0
      ? [
          prisma.cardAssignee.deleteMany({
            where: { cardId, userId: { in: toRemove } },
          }),
        ]
      : []),
    ...(toAdd.length > 0
      ? [
          prisma.cardAssignee.createMany({
            data: toAdd.map((u) => ({ cardId, userId: u })),
          }),
        ]
      : []),
  ]);

  await broadcastBoard(
    card.list.boardId,
    { kind: "card.updated", listId: card.listId, cardId },
    userId,
  );

  if (toAdd.length > 0 || toRemove.length > 0) {
    await logActivity({
      workspaceId: card.list.board.workspaceId,
      actorId: userId,
      action: "CARD_UPDATED",
      entityType: "Card",
      entityId: cardId,
      payload: {
        title: await getCardTitle(cardId),
        fields: ["assignees"],
        added: toAdd.length,
        removed: toRemove.length,
      },
    });
  }

  // Notify only newly-added assignees, excluding self-assigns.
  if (toAdd.length > 0) {
    const actor = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const actorName = actor?.name ?? actor?.email ?? "Someone";
    await Promise.all(
      toAdd
        .filter((u) => u !== userId)
        .map((u) =>
          createNotification({
            userId: u,
            type: "ASSIGNED",
            payload: {
              cardId,
              boardId: card.list.boardId,
              workspaceSlug: card.list.board.workspace.slug,
              actorId: userId,
              actorName,
              workspaceId: card.list.board.workspaceId,
            },
          }),
        ),
    );
  }

  return prisma.user
    .findMany({
      where: { id: { in: desired } },
      select: { id: true, name: true, email: true, image: true },
    })
    .then((rows) =>
      rows.map((r) => ({
        userId: r.id,
        name: r.name,
        email: r.email,
        image: r.image,
      })),
    );
}

async function getCardTitle(cardId: string): Promise<string | null> {
  const c = await prisma.card.findUnique({
    where: { id: cardId },
    select: { title: true },
  });
  return c?.title ?? null;
}
