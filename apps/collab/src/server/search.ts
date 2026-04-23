import { prisma } from "@/lib/db";

export type SearchWorkspaceHit = {
  kind: "workspace";
  id: string;
  name: string;
  slug: string;
  color: string;
};

export type SearchBoardHit = {
  kind: "board";
  id: string;
  title: string;
  color: string | null;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
};

export type SearchCardHit = {
  kind: "card";
  id: string;
  title: string;
  boardId: string;
  boardTitle: string;
  workspaceSlug: string;
  workspaceName: string;
};

export type SearchHit = SearchWorkspaceHit | SearchBoardHit | SearchCardHit;

export type SearchResult = {
  workspaces: SearchWorkspaceHit[];
  boards: SearchBoardHit[];
  cards: SearchCardHit[];
};

const PER_CATEGORY_LIMIT = 8;

/**
 * Cross-workspace search for the palette. Returns all three categories in one
 * round-trip, each capped to keep the payload bounded. Membership is enforced
 * at the query level — we never return rows from workspaces the caller isn't
 * in. Empty query returns recent workspaces + recent boards only, which makes
 * the palette useful as a fast navigator without any typing.
 */
export async function searchForUser(
  userId: string,
  rawQuery: string,
): Promise<SearchResult> {
  const q = rawQuery.trim();

  if (q.length === 0) {
    const memberships = await prisma.membership.findMany({
      where: { userId, workspace: { deletedAt: null } },
      select: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            boards: {
              where: { deletedAt: null },
              orderBy: { updatedAt: "desc" },
              take: 3,
              select: { id: true, title: true, color: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
      take: PER_CATEGORY_LIMIT,
    });

    const workspaces: SearchWorkspaceHit[] = memberships.map((m) => ({
      kind: "workspace",
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      color: m.workspace.color,
    }));

    const boards: SearchBoardHit[] = [];
    for (const m of memberships) {
      for (const b of m.workspace.boards) {
        if (boards.length >= PER_CATEGORY_LIMIT) break;
        boards.push({
          kind: "board",
          id: b.id,
          title: b.title,
          color: b.color,
          workspaceId: m.workspace.id,
          workspaceSlug: m.workspace.slug,
          workspaceName: m.workspace.name,
        });
      }
    }

    return { workspaces, boards, cards: [] };
  }

  const workspaceRows = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      memberships: { some: { userId } },
      name: { contains: q, mode: "insensitive" },
    },
    select: { id: true, name: true, slug: true, color: true },
    orderBy: { updatedAt: "desc" },
    take: PER_CATEGORY_LIMIT,
  });

  const boardRows = await prisma.board.findMany({
    where: {
      deletedAt: null,
      workspace: {
        deletedAt: null,
        memberships: { some: { userId } },
      },
      title: { contains: q, mode: "insensitive" },
    },
    select: {
      id: true,
      title: true,
      color: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: PER_CATEGORY_LIMIT,
  });

  const cardRows = await prisma.card.findMany({
    where: {
      list: {
        board: {
          deletedAt: null,
          workspace: {
            deletedAt: null,
            memberships: { some: { userId } },
          },
        },
      },
      title: { contains: q, mode: "insensitive" },
    },
    select: {
      id: true,
      title: true,
      list: {
        select: {
          board: {
            select: {
              id: true,
              title: true,
              workspace: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: PER_CATEGORY_LIMIT,
  });

  return {
    workspaces: workspaceRows.map((w) => ({
      kind: "workspace",
      id: w.id,
      name: w.name,
      slug: w.slug,
      color: w.color,
    })),
    boards: boardRows.map((b) => ({
      kind: "board",
      id: b.id,
      title: b.title,
      color: b.color,
      workspaceId: b.workspace.id,
      workspaceSlug: b.workspace.slug,
      workspaceName: b.workspace.name,
    })),
    cards: cardRows.map((c) => ({
      kind: "card",
      id: c.id,
      title: c.title,
      boardId: c.list.board.id,
      boardTitle: c.list.board.title,
      workspaceSlug: c.list.board.workspace.slug,
      workspaceName: c.list.board.workspace.name,
    })),
  };
}
