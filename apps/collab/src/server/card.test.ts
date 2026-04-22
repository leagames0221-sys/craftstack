import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";

type CardRow = {
  id: string;
  version: number;
  list: {
    board: {
      workspaceId: string;
      workspace: {
        memberships: Array<{
          role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
        }>;
      };
    };
  };
};

const cardFindUnique = vi.fn<(args: unknown) => Promise<CardRow | null>>();
const cardUpdateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>();
const cardFindUniqueOrThrow = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findUnique: (a: unknown) => cardFindUnique(a),
      updateMany: (a: unknown) => cardUpdateMany(a),
      findUniqueOrThrow: (a: unknown) => cardFindUniqueOrThrow(a),
    },
  },
}));

const { updateCard } = await import("./card");

const baseCard = (
  role: CardRow["list"]["board"]["workspace"]["memberships"][0]["role"],
): CardRow => ({
  id: "c1",
  version: 1,
  list: {
    board: {
      workspaceId: "w1",
      workspace: { memberships: [{ role }] },
    },
  },
});

beforeEach(() => {
  cardFindUnique.mockReset();
  cardUpdateMany.mockReset();
  cardFindUniqueOrThrow.mockReset();
});

describe("updateCard optimistic lock", () => {
  it("NotFound when card missing", async () => {
    cardFindUnique.mockResolvedValueOnce(null);
    await expect(
      updateCard("u1", "c404", { version: 1, title: "new" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Forbidden when caller is VIEWER", async () => {
    cardFindUnique.mockResolvedValueOnce(baseCard("VIEWER"));
    await expect(
      updateCard("u1", "c1", { version: 1, title: "new" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("bumps version when supplied version matches", async () => {
    cardFindUnique.mockResolvedValueOnce(baseCard("EDITOR"));
    cardUpdateMany.mockResolvedValueOnce({ count: 1 });
    cardFindUniqueOrThrow.mockResolvedValueOnce({
      id: "c1",
      version: 2,
      listId: "l1",
      title: "title",
      list: { boardId: "b1", board: { workspaceId: "w1" } },
    });

    const out = await updateCard("u1", "c1", {
      version: 1,
      title: "renamed",
    });
    expect((out as { version: number }).version).toBe(2);

    const updateArg = cardUpdateMany.mock.calls[0]?.[0] as {
      where: { id: string; version: number };
      data: { version: { increment: number } };
    };
    expect(updateArg.where.version).toBe(1);
    expect(updateArg.data.version.increment).toBe(1);
  });

  it("throws ConflictError when supplied version is stale", async () => {
    cardFindUnique.mockResolvedValueOnce(baseCard("EDITOR"));
    cardUpdateMany.mockResolvedValueOnce({ count: 0 });
    cardFindUnique.mockResolvedValueOnce({
      ...baseCard("EDITOR"),
      version: 5,
    });

    await expect(
      updateCard("u1", "c1", { version: 1, title: "too old" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("OWNER can also update", async () => {
    cardFindUnique.mockResolvedValueOnce(baseCard("OWNER"));
    cardUpdateMany.mockResolvedValueOnce({ count: 1 });
    cardFindUniqueOrThrow.mockResolvedValueOnce({
      id: "c1",
      version: 2,
      listId: "l1",
      title: "title",
      list: { boardId: "b1", board: { workspaceId: "w1" } },
    });

    await expect(
      updateCard("u1", "c1", { version: 1, title: "owner edit" }),
    ).resolves.toMatchObject({ id: "c1" });
  });
});
