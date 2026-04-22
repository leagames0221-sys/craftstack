import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors";

const wsFindFirst = vi.fn<(args: unknown) => Promise<unknown>>();
const labelFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
const labelFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>();
const labelCount = vi.fn<(args: unknown) => Promise<number>>();
const labelCreate = vi.fn<(args: unknown) => Promise<unknown>>();
const cardFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();
const txFn = vi.fn<(ops: unknown) => Promise<unknown>>();
const activityCreate = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findFirst: (a: unknown) => wsFindFirst(a) },
    label: {
      findUnique: (a: unknown) => labelFindUnique(a),
      findMany: (a: unknown) => labelFindMany(a),
      count: (a: unknown) => labelCount(a),
      create: (a: unknown) => labelCreate(a),
    },
    card: { findUnique: (a: unknown) => cardFindUnique(a) },
    cardLabel: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    activityLog: { create: (a: unknown) => activityCreate(a) },
    $transaction: (ops: unknown) => txFn(ops),
  },
}));

const { createLabel, setCardLabels } = await import("./label");

beforeEach(() => {
  wsFindFirst.mockReset();
  labelFindUnique.mockReset();
  labelFindMany.mockReset();
  labelCount.mockReset();
  labelCreate.mockReset();
  cardFindUnique.mockReset();
  txFn.mockReset().mockResolvedValue([]);
  activityCreate.mockReset().mockResolvedValue({});
});

describe("createLabel", () => {
  it("rejects invalid color", async () => {
    await expect(
      createLabel("u1", "ws1", { name: "Bug", color: "red" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects empty name", async () => {
    await expect(
      createLabel("u1", "ws1", { name: "   ", color: "#FF0000" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects EDITOR (needs ADMIN+)", async () => {
    wsFindFirst.mockResolvedValueOnce({
      id: "ws1",
      memberships: [{ role: "EDITOR" }],
    });
    await expect(
      createLabel("u1", "ws1", { name: "Bug", color: "#FF0000" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("maps unique-violation (P2002) to 409 LABEL_NAME_TAKEN", async () => {
    wsFindFirst.mockResolvedValueOnce({
      id: "ws1",
      memberships: [{ role: "ADMIN" }],
    });
    labelCreate.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      createLabel("u1", "ws1", { name: "Bug", color: "#FF0000" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("ADMIN can create, trims name, logs activity", async () => {
    wsFindFirst.mockResolvedValueOnce({
      id: "ws1",
      memberships: [{ role: "ADMIN" }],
    });
    labelCreate.mockResolvedValueOnce({
      id: "lb1",
      name: "Bug",
      color: "#FF0000",
    });
    const out = await createLabel("u1", "ws1", {
      name: "  Bug  ",
      color: "#FF0000",
    });
    expect(out.id).toBe("lb1");
    expect(
      (labelCreate.mock.calls[0]?.[0] as { data: { name: string } }).data.name,
    ).toBe("Bug");
    expect(activityCreate).toHaveBeenCalledOnce();
  });
});

describe("setCardLabels cross-workspace guard", () => {
  it("rejects when supplied label ids belong to a different workspace", async () => {
    cardFindUnique.mockResolvedValueOnce({
      id: "c1",
      listId: "l1",
      list: {
        boardId: "b1",
        board: {
          workspaceId: "ws1",
          workspace: { memberships: [{ role: "EDITOR" }] },
        },
      },
      cardLabels: [],
    });
    // only 1 label of the 2 requested lives in ws1 → mismatch
    labelCount.mockResolvedValueOnce(1);

    await expect(
      setCardLabels("u1", "c1", ["lb-ws1", "lb-ws2"]),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("NotFound when card missing", async () => {
    cardFindUnique.mockResolvedValueOnce(null);
    await expect(setCardLabels("u1", "c-404", ["lb1"])).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("Forbidden when VIEWER attaches labels", async () => {
    cardFindUnique.mockResolvedValueOnce({
      id: "c1",
      listId: "l1",
      list: {
        boardId: "b1",
        board: {
          workspaceId: "ws1",
          workspace: { memberships: [{ role: "VIEWER" }] },
        },
      },
      cardLabels: [],
    });
    await expect(setCardLabels("u1", "c1", ["lb1"])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
