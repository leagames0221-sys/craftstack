import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn<(args: unknown) => Promise<unknown[]>>();
const countFn = vi.fn<(args: unknown) => Promise<number>>();
const updateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>();
const createFn = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      findMany: (a: unknown) => findMany(a),
      count: (a: unknown) => countFn(a),
      updateMany: (a: unknown) => updateMany(a),
      create: (a: unknown) => createFn(a),
    },
  },
}));

const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  createNotification,
} = await import("./notification");

beforeEach(() => {
  findMany.mockReset();
  countFn.mockReset();
  updateMany.mockReset().mockResolvedValue({ count: 0 });
  createFn.mockReset().mockResolvedValue({});
});

describe("listNotifications", () => {
  it("maps Date -> ISO string and Json -> {}", async () => {
    const now = new Date();
    findMany.mockResolvedValueOnce([
      {
        id: "n1",
        type: "MENTION",
        payload: { actorName: "Alice" },
        readAt: null,
        createdAt: now,
      },
      {
        id: "n2",
        type: "COMMENT_ON_CARD",
        payload: null,
        readAt: now,
        createdAt: now,
      },
    ]);

    const out = await listNotifications("u1");
    expect(out[0]).toMatchObject({
      id: "n1",
      type: "MENTION",
      readAt: null,
      payload: { actorName: "Alice" },
    });
    expect(out[0].createdAt).toBe(now.toISOString());
    expect(out[1].readAt).toBe(now.toISOString());
    expect(out[1].payload).toEqual({});
  });

  it("clamps limit to [1, 100]", async () => {
    findMany.mockResolvedValueOnce([]);
    await listNotifications("u1", { limit: 10000 });
    const args = findMany.mock.calls[0]?.[0] as { take: number };
    expect(args.take).toBe(100);
  });
});

describe("unreadCount", () => {
  it("counts readAt=null for the caller", async () => {
    countFn.mockResolvedValueOnce(3);
    expect(await unreadCount("u1")).toBe(3);
    const args = countFn.mock.calls[0]?.[0] as {
      where: { userId: string; readAt: null };
    };
    expect(args.where.userId).toBe("u1");
    expect(args.where.readAt).toBeNull();
  });
});

describe("markRead / markAllRead", () => {
  it("markRead scopes to (id, userId, unread)", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    await markRead("u1", "n1");
    const args = updateMany.mock.calls[0]?.[0] as {
      where: { id: string; userId: string; readAt: null };
    };
    expect(args.where).toMatchObject({
      id: "n1",
      userId: "u1",
      readAt: null,
    });
  });

  it("markAllRead returns updated count", async () => {
    updateMany.mockResolvedValueOnce({ count: 7 });
    expect(await markAllRead("u1")).toBe(7);
  });
});

describe("createNotification", () => {
  it("swallows insert errors (best-effort)", async () => {
    createFn.mockRejectedValueOnce(new Error("boom"));
    await expect(
      createNotification({
        userId: "u1",
        type: "MENTION",
        payload: {},
      }),
    ).resolves.toBeUndefined();
  });
});
