import { describe, expect, it, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

type WorkspaceRow = {
  id: string;
  memberships: Array<{ role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" }>;
};

const workspaceFindFirstMock =
  vi.fn<(args: unknown) => Promise<WorkspaceRow | null>>();
const boardCreateMock = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: {
      findFirst: (args: unknown) => workspaceFindFirstMock(args),
    },
    board: {
      create: (args: unknown) => boardCreateMock(args),
    },
  },
}));

const { createBoard } = await import("./board");

beforeEach(() => {
  workspaceFindFirstMock.mockReset();
  boardCreateMock.mockReset();
});

describe("createBoard RBAC gates", () => {
  it("returns NotFound when the workspace is missing", async () => {
    workspaceFindFirstMock.mockResolvedValueOnce(null);
    await expect(
      createBoard("u1", "missing", { title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("forbids when the user has no membership", async () => {
    workspaceFindFirstMock.mockResolvedValueOnce({
      id: "ws_1",
      memberships: [],
    });
    await expect(
      createBoard("u1", "demo", { title: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forbids when role is VIEWER", async () => {
    workspaceFindFirstMock.mockResolvedValueOnce({
      id: "ws_1",
      memberships: [{ role: "VIEWER" }],
    });
    await expect(
      createBoard("u1", "demo", { title: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows EDITOR and inserts a board with a LexoRank position", async () => {
    workspaceFindFirstMock.mockResolvedValueOnce({
      id: "ws_1",
      memberships: [{ role: "EDITOR" }],
    });
    boardCreateMock.mockResolvedValueOnce({
      id: "b1",
      title: "Backlog",
      color: "#6366F1",
    });

    const out = await createBoard("u1", "demo", { title: "Backlog" });
    expect(out.id).toBe("b1");

    const arg = boardCreateMock.mock.calls[0]?.[0] as {
      data: {
        workspaceId: string;
        title: string;
        color: string;
        position: string;
      };
    };
    expect(arg.data.workspaceId).toBe("ws_1");
    expect(arg.data.title).toBe("Backlog");
    expect(arg.data.position).toMatch(/^[a-z0-9|:]/i);
  });

  it("accepts OWNER role", async () => {
    workspaceFindFirstMock.mockResolvedValueOnce({
      id: "ws_1",
      memberships: [{ role: "OWNER" }],
    });
    boardCreateMock.mockResolvedValueOnce({
      id: "b2",
      title: "x",
      color: "#FFFFFF",
    });

    await expect(
      createBoard("u1", "demo", { title: "x", color: "#FFFFFF" }),
    ).resolves.toMatchObject({ id: "b2" });
  });
});
