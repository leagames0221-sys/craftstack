import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors";
import { logActivity } from "./activity";
import { broadcastBoard } from "@/lib/pusher";

/**
 * Labels are workspace-scoped so the same set can be reused across every
 * board. CardLabel is the join table that attaches a label to a card.
 * RBAC: ADMIN+ for label CRUD (so the palette stays curated), EDITOR+ for
 * attach / detach on cards. VIEWER can read.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME_LEN = 40;

export type LabelRow = {
  id: string;
  name: string;
  color: string;
};

export async function listLabels(
  userId: string,
  workspaceId: string,
): Promise<LabelRow[]> {
  await assertWorkspaceMember(userId, workspaceId, "VIEWER");
  return prisma.label.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}

export async function createLabel(
  userId: string,
  workspaceId: string,
  input: { name: string; color: string },
): Promise<LabelRow> {
  const name = input.name.trim();
  const color = input.color.trim();
  if (!name || name.length > MAX_NAME_LEN) {
    throw new BadRequestError("Invalid name", {
      fieldErrors: { name: `1–${MAX_NAME_LEN} chars required` },
    });
  }
  if (!HEX.test(color)) {
    throw new BadRequestError("Invalid color", {
      fieldErrors: { color: "must be #RRGGBB" },
    });
  }

  await assertWorkspaceMember(userId, workspaceId, "ADMIN");

  try {
    const row = await prisma.label.create({
      data: { workspaceId, name, color },
      select: { id: true, name: true, color: true },
    });
    await logActivity({
      workspaceId,
      actorId: userId,
      action: "LABEL_CREATED",
      entityType: "Label",
      entityId: row.id,
      payload: { name, color },
    });
    return row;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Unique index (workspaceId, name) tripped.
      throw new ConflictError(
        "LABEL_NAME_TAKEN",
        "A label with that name already exists in this workspace.",
      );
    }
    throw err;
  }
}

export async function updateLabel(
  userId: string,
  labelId: string,
  input: { name?: string; color?: string },
): Promise<LabelRow> {
  const label = await prisma.label.findUnique({
    where: { id: labelId },
    select: { id: true, workspaceId: true },
  });
  if (!label) throw new NotFoundError("Label");
  await assertWorkspaceMember(userId, label.workspaceId, "ADMIN");

  const data: { name?: string; color?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > MAX_NAME_LEN) {
      throw new BadRequestError("Invalid name", {
        fieldErrors: { name: `1–${MAX_NAME_LEN} chars required` },
      });
    }
    data.name = name;
  }
  if (input.color !== undefined) {
    if (!HEX.test(input.color)) {
      throw new BadRequestError("Invalid color", {
        fieldErrors: { color: "must be #RRGGBB" },
      });
    }
    data.color = input.color;
  }
  if (Object.keys(data).length === 0) {
    throw new BadRequestError("Nothing to update");
  }

  try {
    const row = await prisma.label.update({
      where: { id: labelId },
      data,
      select: { id: true, name: true, color: true },
    });
    await logActivity({
      workspaceId: label.workspaceId,
      actorId: userId,
      action: "LABEL_UPDATED",
      entityType: "Label",
      entityId: labelId,
      payload: data,
    });
    return row;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      throw new ConflictError(
        "LABEL_NAME_TAKEN",
        "A label with that name already exists.",
      );
    }
    throw err;
  }
}

export async function deleteLabel(userId: string, labelId: string) {
  const label = await prisma.label.findUnique({
    where: { id: labelId },
    select: { id: true, workspaceId: true, name: true },
  });
  if (!label) throw new NotFoundError("Label");
  await assertWorkspaceMember(userId, label.workspaceId, "ADMIN");

  await prisma.label.delete({ where: { id: labelId } });
  await logActivity({
    workspaceId: label.workspaceId,
    actorId: userId,
    action: "LABEL_DELETED",
    entityType: "Label",
    entityId: labelId,
    payload: { name: label.name },
  });
}

/**
 * Replace the label set attached to a card in one go. The client supplies
 * the full desired list of label ids; the server diffs against the current
 * state. Gives the UI a dead-simple "toggle label X" UX without us needing
 * two endpoints.
 */
export async function setCardLabels(
  userId: string,
  cardId: string,
  labelIds: string[],
): Promise<LabelRow[]> {
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
      cardLabels: { select: { labelId: true } },
    },
  });
  if (!card) throw new NotFoundError("Card");
  const role = card.list.board.workspace.memberships[0]?.role;
  if (!role || !roleAtLeast(role, "EDITOR")) {
    throw new ForbiddenError("CARD_LABEL_DENIED");
  }

  // All supplied label ids must belong to the same workspace as the card.
  // Otherwise we'd leak labels across tenants.
  const desiredUnique = Array.from(new Set(labelIds));
  if (desiredUnique.length > 0) {
    const count = await prisma.label.count({
      where: {
        id: { in: desiredUnique },
        workspaceId: card.list.board.workspaceId,
      },
    });
    if (count !== desiredUnique.length) {
      throw new BadRequestError("Unknown or cross-workspace label id");
    }
  }

  const current = new Set(card.cardLabels.map((cl) => cl.labelId));
  const desired = new Set(desiredUnique);
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  await prisma.$transaction([
    ...(toRemove.length > 0
      ? [
          prisma.cardLabel.deleteMany({
            where: { cardId, labelId: { in: toRemove } },
          }),
        ]
      : []),
    ...(toAdd.length > 0
      ? [
          prisma.cardLabel.createMany({
            data: toAdd.map((labelId) => ({ cardId, labelId })),
          }),
        ]
      : []),
  ]);

  await broadcastBoard(
    card.list.boardId,
    { kind: "card.updated", listId: card.listId, cardId },
    userId,
  );

  return prisma.label.findMany({
    where: { id: { in: desiredUnique } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}

async function assertWorkspaceMember(
  userId: string,
  workspaceId: string,
  required: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER",
) {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    include: {
      memberships: { where: { userId }, select: { role: true } },
    },
  });
  if (!ws) throw new NotFoundError("Workspace");
  const role = ws.memberships[0]?.role;
  if (!role || !roleAtLeast(role, required)) {
    throw new ForbiddenError("LABEL_DENIED");
  }
  return role;
}
