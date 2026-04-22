import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

type BoardRow = {
  id: string;
  workspace: {
    deletedAt: Date | null;
    memberships: Array<{ role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" }>;
  };
  lists: Array<{ position: string }>;
};

const boardFindFirst = vi.fn<(args: unknown) => Promise<BoardRow | null>>();
const listCreate = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    board: { findFirst: (a: unknown) => boardFindFirst(a) },
    list: { create: (a: unknown) => listCreate(a) },
  },
}));

const { createList } = await import("./list");

beforeEach(() => {
  boardFindFirst.mockReset();
  listCreate.mockReset();
});

describe("createList", () => {
  it("NotFound when board missing", async () => {
    boardFindFirst.mockResolvedValueOnce(null);
    await expect(
      createList("u1", "b404", { title: "todo" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Forbidden when caller is VIEWER", async () => {
    boardFindFirst.mockResolvedValueOnce({
      id: "b1",
      workspace: { deletedAt: null, memberships: [{ role: "VIEWER" }] },
      lists: [],
    });
    await expect(
      createList("u1", "b1", { title: "todo" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("EDITOR creates list at first position on empty board", async () => {
    boardFindFirst.mockResolvedValueOnce({
      id: "b1",
      workspace: { deletedAt: null, memberships: [{ role: "EDITOR" }] },
      lists: [],
    });
    listCreate.mockResolvedValueOnce({
      id: "l1",
      boardId: "b1",
      title: "todo",
      position: "placeholder",
    });

    await createList("u1", "b1", { title: "todo" });
    const arg = listCreate.mock.calls[0]?.[0] as {
      data: { boardId: string; title: string; position: string };
    };
    expect(arg.data.boardId).toBe("b1");
    expect(arg.data.title).toBe("todo");
    expect(typeof arg.data.position).toBe("string");
    expect(arg.data.position.length).toBeGreaterThan(0);
  });

  it("appends after the last list when lists exist", async () => {
    boardFindFirst.mockResolvedValueOnce({
      id: "b1",
      workspace: { deletedAt: null, memberships: [{ role: "OWNER" }] },
      lists: [{ position: "0|hzzzzz:" }],
    });
    listCreate.mockResolvedValueOnce({
      id: "l2",
      boardId: "b1",
      title: "done",
      position: "placeholder",
    });

    await createList("u1", "b1", { title: "done" });
    const arg = listCreate.mock.calls[0]?.[0] as {
      data: { position: string };
    };
    // between("0|hzzzzz:", null) must be > "0|hzzzzz:"
    expect(arg.data.position > "0|hzzzzz:").toBe(true);
  });

  it("skips soft-deleted workspace", async () => {
    boardFindFirst.mockResolvedValueOnce({
      id: "b1",
      workspace: {
        deletedAt: new Date("2026-01-01"),
        memberships: [{ role: "OWNER" }],
      },
      lists: [],
    });
    await expect(
      createList("u1", "b1", { title: "todo" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
