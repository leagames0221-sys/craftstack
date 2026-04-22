import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

const wsFindFirst = vi.fn<(args: unknown) => Promise<unknown>>();
const logFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>();
const logCreate = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findFirst: (a: unknown) => wsFindFirst(a) },
    activityLog: {
      findMany: (a: unknown) => logFindMany(a),
      create: (a: unknown) => logCreate(a),
    },
  },
}));

const { listActivity, logActivity } = await import("./activity");

beforeEach(() => {
  wsFindFirst.mockReset();
  logFindMany.mockReset();
  logCreate.mockReset();
});

describe("listActivity", () => {
  it("NotFound when workspace missing or not a member", async () => {
    wsFindFirst.mockResolvedValueOnce(null);
    await expect(listActivity("u1", "ws-404")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("Forbidden when member has no role row (shouldn't happen, defense in depth)", async () => {
    wsFindFirst.mockResolvedValueOnce({ id: "ws1", memberships: [] });
    await expect(listActivity("u1", "ws1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("VIEWER is allowed and receives mapped rows", async () => {
    wsFindFirst.mockResolvedValueOnce({
      id: "ws1",
      memberships: [{ role: "VIEWER" }],
    });
    const now = new Date();
    logFindMany.mockResolvedValueOnce([
      {
        id: "a1",
        action: "CARD_CREATED",
        entityType: "Card",
        entityId: "c1",
        payload: { title: "Hello" },
        createdAt: now,
        actor: { id: "u1", name: "Alice", email: "a@x", image: null },
      },
    ]);

    const out = await listActivity("u1", "ws1");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "a1",
      action: "CARD_CREATED",
      payload: { title: "Hello" },
    });
    expect(out[0].createdAt).toBe(now.toISOString());
  });

  it("clamps limit to [1, 100]", async () => {
    wsFindFirst.mockResolvedValueOnce({
      id: "ws1",
      memberships: [{ role: "OWNER" }],
    });
    logFindMany.mockResolvedValueOnce([]);
    await listActivity("u1", "ws1", { limit: 9999 });
    const args = logFindMany.mock.calls[0]?.[0] as { take: number };
    expect(args.take).toBe(100);
  });

  it("honours cursor (skip 1, cursor by id)", async () => {
    wsFindFirst.mockResolvedValueOnce({
      id: "ws1",
      memberships: [{ role: "VIEWER" }],
    });
    logFindMany.mockResolvedValueOnce([]);
    await listActivity("u1", "ws1", { cursor: "cursor-id" });
    const args = logFindMany.mock.calls[0]?.[0] as {
      skip?: number;
      cursor?: { id: string };
    };
    expect(args.skip).toBe(1);
    expect(args.cursor).toEqual({ id: "cursor-id" });
  });
});

describe("logActivity", () => {
  it("swallows insert errors instead of throwing (best-effort)", async () => {
    logCreate.mockRejectedValueOnce(new Error("db down"));
    await expect(
      logActivity({
        workspaceId: "ws1",
        actorId: "u1",
        action: "CARD_CREATED",
        entityType: "Card",
        entityId: "c1",
      }),
    ).resolves.toBeUndefined();
  });
});
