import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";

const cardFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
const membershipCount = vi.fn<(args: unknown) => Promise<number>>();
const userFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>();
const userFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
const cardFindUnique2 = vi.fn<(args: unknown) => Promise<unknown>>(); // getCardTitle
const notifCreate = vi.fn<(args: unknown) => Promise<unknown>>();
const txFn = vi.fn<(ops: unknown) => Promise<unknown>>();
const activityCreate = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findUnique: (a: unknown) => {
        // First call in setCardAssignees is the full include; later
        // getCardTitle call is a simple select. Route both through
        // the same mock queue.
        if (cardFindUnique.mock.calls.length === 0) return cardFindUnique(a);
        return cardFindUnique2(a);
      },
    },
    membership: { count: (a: unknown) => membershipCount(a) },
    user: {
      findMany: (a: unknown) => userFindMany(a),
      findUnique: (a: unknown) => userFindUnique(a),
    },
    cardAssignee: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    notification: { create: (a: unknown) => notifCreate(a) },
    activityLog: { create: (a: unknown) => activityCreate(a) },
    $transaction: (ops: unknown) => txFn(ops),
  },
}));

const { setCardAssignees } = await import("./assignee");

beforeEach(() => {
  cardFindUnique.mockReset();
  cardFindUnique2.mockReset().mockResolvedValue({ title: "x" });
  membershipCount.mockReset();
  userFindMany.mockReset().mockResolvedValue([]);
  userFindUnique.mockReset().mockResolvedValue({ name: "Alice", email: "a@x" });
  notifCreate.mockReset().mockResolvedValue({});
  txFn.mockReset().mockResolvedValue([]);
  activityCreate.mockReset().mockResolvedValue({});
});

function cardWith(
  role: "VIEWER" | "EDITOR" | "ADMIN" | "OWNER",
  assignees: string[] = [],
) {
  return {
    id: "c1",
    listId: "l1",
    list: {
      boardId: "b1",
      board: {
        workspaceId: "ws1",
        workspace: {
          slug: "acme",
          memberships: [{ role }],
        },
      },
    },
    assignees: assignees.map((userId) => ({ userId })),
  };
}

describe("setCardAssignees", () => {
  it("NotFound when card missing", async () => {
    cardFindUnique.mockResolvedValueOnce(null);
    await expect(
      setCardAssignees("u1", "c-404", ["u2"]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Forbidden for VIEWER", async () => {
    cardFindUnique.mockResolvedValueOnce(cardWith("VIEWER"));
    await expect(setCardAssignees("u1", "c1", ["u2"])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejects when any target user is not a workspace member", async () => {
    cardFindUnique.mockResolvedValueOnce(cardWith("EDITOR"));
    membershipCount.mockResolvedValueOnce(1); // only 1 of 2 matched
    await expect(
      setCardAssignees("u1", "c1", ["u-good", "u-foreign"]),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("notifies only newly-added (not already assigned, not self)", async () => {
    cardFindUnique.mockResolvedValueOnce(cardWith("EDITOR", ["u-old"]));
    membershipCount.mockResolvedValueOnce(3); // u-old, u-new, u1 all members
    userFindMany.mockResolvedValueOnce([
      { id: "u-old", name: null, email: "old@x", image: null },
      { id: "u-new", name: null, email: "new@x", image: null },
      { id: "u1", name: null, email: "u1@x", image: null },
    ]);

    await setCardAssignees("u1", "c1", ["u-old", "u-new", "u1"]);

    // Only u-new is a fresh non-self add → exactly one notification.
    expect(notifCreate).toHaveBeenCalledOnce();
    const args = notifCreate.mock.calls[0]?.[0] as {
      data: { userId: string; type: string };
    };
    expect(args.data.userId).toBe("u-new");
    expect(args.data.type).toBe("ASSIGNED");
  });

  it("dedupes repeated ids in the input", async () => {
    cardFindUnique.mockResolvedValueOnce(cardWith("EDITOR"));
    membershipCount.mockResolvedValueOnce(1);
    userFindMany.mockResolvedValueOnce([
      { id: "u-new", name: null, email: "n@x", image: null },
    ]);

    await setCardAssignees("u1", "c1", ["u-new", "u-new", "u-new"]);
    // membershipCount should have been asked about exactly 1 unique id
    const args = membershipCount.mock.calls[0]?.[0] as {
      where: { userId: { in: string[] } };
    };
    expect(args.where.userId.in).toEqual(["u-new"]);
  });
});
