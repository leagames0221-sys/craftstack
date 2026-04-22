import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

const cardFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
const logFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findUnique: (a: unknown) => cardFindUnique(a) },
    activityLog: { findMany: (a: unknown) => logFindMany(a) },
    workspace: { findFirst: vi.fn() },
  },
}));

const { listCardActivity } = await import("./activity");

function card(role: "VIEWER" | "EDITOR" | "ADMIN" | "OWNER" | null) {
  return {
    id: "c1",
    list: {
      board: {
        workspaceId: "ws1",
        workspace: {
          memberships: role ? [{ role }] : [],
        },
      },
    },
  };
}

beforeEach(() => {
  cardFindUnique.mockReset();
  logFindMany.mockReset().mockResolvedValue([]);
});

describe("listCardActivity", () => {
  it("NotFound when card missing", async () => {
    cardFindUnique.mockResolvedValueOnce(null);
    await expect(listCardActivity("u1", "c-404")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("Forbidden when caller is not a workspace member", async () => {
    cardFindUnique.mockResolvedValueOnce(card(null));
    await expect(listCardActivity("u1", "c1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("VIEWER may read", async () => {
    cardFindUnique.mockResolvedValueOnce(card("VIEWER"));
    await expect(listCardActivity("u1", "c1")).resolves.toEqual([]);
  });

  it("queries both Card-direct and Comment-via-payload rows", async () => {
    cardFindUnique.mockResolvedValueOnce(card("EDITOR"));
    await listCardActivity("u1", "c1");
    const args = logFindMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
      take: number;
    };
    expect(args.where.OR).toHaveLength(2);
    expect(args.where.OR[0]).toMatchObject({
      entityType: "Card",
      entityId: "c1",
    });
    expect(args.where.OR[1]).toMatchObject({ entityType: "Comment" });
    expect(args.where.OR[1].payload).toMatchObject({
      path: ["cardId"],
      equals: "c1",
    });
  });

  it("clamps limit to [1, 100]", async () => {
    cardFindUnique.mockResolvedValueOnce(card("VIEWER"));
    await listCardActivity("u1", "c1", { limit: 9999 });
    const args = logFindMany.mock.calls[0]?.[0] as { take: number };
    expect(args.take).toBe(100);
  });
});
