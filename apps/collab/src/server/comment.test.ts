import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/errors";

type CommentRow = {
  id: string;
  authorId: string;
  deletedAt: Date | null;
  card: {
    id: string;
    listId: string;
    list: {
      boardId: string;
      board: {
        workspace: {
          memberships: Array<{ role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" }>;
        };
      };
    };
  };
};

type CardRow = {
  id: string;
  listId: string;
  list: {
    boardId: string;
    board: {
      workspace: {
        memberships: Array<{ role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" }>;
      };
    };
  };
};

const cardFindUnique = vi.fn<(args: unknown) => Promise<CardRow | null>>();
const commentFindUnique =
  vi.fn<(args: unknown) => Promise<CommentRow | null>>();
const commentCreate = vi.fn<(args: unknown) => Promise<unknown>>();
const commentUpdate = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findUnique: (a: unknown) => cardFindUnique(a) },
    comment: {
      findUnique: (a: unknown) => commentFindUnique(a),
      create: (a: unknown) => commentCreate(a),
      update: (a: unknown) => commentUpdate(a),
    },
  },
}));

// Pusher broadcast is a best-effort no-op in tests (no creds, function
// returns null client); import the real module so signature stays honest.

const { createComment, deleteComment } = await import("./comment");

function makeCard(
  role: CardRow["list"]["board"]["workspace"]["memberships"][0]["role"],
): CardRow {
  return {
    id: "c1",
    listId: "l1",
    list: {
      boardId: "b1",
      board: {
        workspace: { memberships: [{ role }] },
      },
    },
  };
}

function makeComment(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    id: "cm1",
    authorId: "author1",
    deletedAt: null,
    card: {
      id: "c1",
      listId: "l1",
      list: {
        boardId: "b1",
        board: {
          workspace: { memberships: [{ role: "EDITOR" }] },
        },
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  cardFindUnique.mockReset();
  commentFindUnique.mockReset();
  commentCreate.mockReset();
  commentUpdate.mockReset();
});

describe("createComment", () => {
  it("rejects empty body with 400", async () => {
    await expect(
      createComment("u1", "c1", { body: "   " }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects body > 4000 chars", async () => {
    await expect(
      createComment("u1", "c1", { body: "x".repeat(4001) }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects VIEWER posting (needs EDITOR+)", async () => {
    cardFindUnique.mockResolvedValueOnce(makeCard("VIEWER"));
    await expect(
      createComment("u1", "c1", { body: "nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows EDITOR to post, trims body, returns row", async () => {
    cardFindUnique.mockResolvedValueOnce(makeCard("EDITOR"));
    commentCreate.mockResolvedValueOnce({
      id: "cm-new",
      body: "hello",
      createdAt: new Date(),
      updatedAt: new Date(),
      authorId: "u1",
      author: { id: "u1", name: null, email: "u1@x", image: null },
    });

    const out = await createComment("u1", "c1", { body: "  hello  " });
    expect((out as { id: string }).id).toBe("cm-new");
    const args = commentCreate.mock.calls[0]?.[0] as {
      data: { body: string; authorId: string };
    };
    expect(args.data.body).toBe("hello");
    expect(args.data.authorId).toBe("u1");
  });
});

describe("deleteComment", () => {
  it("NotFound when comment missing", async () => {
    commentFindUnique.mockResolvedValueOnce(null);
    await expect(deleteComment("u1", "cm-404")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("NotFound when already soft-deleted", async () => {
    commentFindUnique.mockResolvedValueOnce(
      makeComment({ deletedAt: new Date() }),
    );
    await expect(deleteComment("u1", "cm1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("Forbidden when non-author EDITOR tries to delete someone else's", async () => {
    commentFindUnique.mockResolvedValueOnce(makeComment());
    await expect(deleteComment("bystander", "cm1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("author can delete their own", async () => {
    commentFindUnique.mockResolvedValueOnce(makeComment());
    commentUpdate.mockResolvedValueOnce({});
    await expect(deleteComment("author1", "cm1")).resolves.toBeUndefined();
    expect(commentUpdate).toHaveBeenCalledOnce();
  });

  it("ADMIN can delete someone else's (moderation)", async () => {
    commentFindUnique.mockResolvedValueOnce(
      makeComment({
        card: {
          id: "c1",
          listId: "l1",
          list: {
            boardId: "b1",
            board: {
              workspace: { memberships: [{ role: "ADMIN" }] },
            },
          },
        },
      }),
    );
    commentUpdate.mockResolvedValueOnce({});
    await expect(deleteComment("admin1", "cm1")).resolves.toBeUndefined();
  });
});
