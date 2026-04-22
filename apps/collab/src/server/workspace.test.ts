import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConflictError } from "@/lib/errors";

type UpsertCreateArgs = Parameters<typeof workspaceFindUniqueMock>[0];

// Module-level mocks. Declared before importing the subject under test so that
// '@/lib/db' resolves to these fakes during import evaluation.
const workspaceFindUniqueMock =
  vi.fn<(args: unknown) => Promise<{ id: string } | null>>();
const workspaceCreateMock = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: {
      findUnique: (args: UpsertCreateArgs) => workspaceFindUniqueMock(args),
      create: (args: UpsertCreateArgs) => workspaceCreateMock(args),
    },
  },
}));

// Import after mock registration.
const { createWorkspace } = await import("./workspace");

beforeEach(() => {
  workspaceFindUniqueMock.mockReset();
  workspaceCreateMock.mockReset();
});

describe("createWorkspace", () => {
  it("creates workspace and auto-adds the creator as OWNER", async () => {
    workspaceFindUniqueMock.mockResolvedValueOnce(null);
    workspaceCreateMock.mockResolvedValueOnce({
      id: "ws_1",
      name: "Demo",
      slug: "demo",
      color: "#4F46E5",
      iconUrl: null,
    });

    const out = await createWorkspace("user_1", { name: "Demo", slug: "demo" });

    expect(out.slug).toBe("demo");
    const createArg = workspaceCreateMock.mock.calls[0]?.[0] as {
      data: { memberships: { create: { userId: string; role: string } } };
    };
    expect(createArg.data.memberships.create.userId).toBe("user_1");
    expect(createArg.data.memberships.create.role).toBe("OWNER");
  });

  it("throws ConflictError when slug already exists", async () => {
    workspaceFindUniqueMock.mockResolvedValueOnce({ id: "ws_existing" });
    await expect(
      createWorkspace("user_1", { name: "Demo", slug: "demo" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(workspaceCreateMock).not.toHaveBeenCalled();
  });

  it("uses default indigo color when none supplied", async () => {
    workspaceFindUniqueMock.mockResolvedValueOnce(null);
    workspaceCreateMock.mockResolvedValueOnce({
      id: "ws_2",
      name: "x",
      slug: "demo2",
      color: "#4F46E5",
      iconUrl: null,
    });

    await createWorkspace("user_1", { name: "x", slug: "demo2" });

    const arg = workspaceCreateMock.mock.calls[0]?.[0] as {
      data: { color: string };
    };
    expect(arg.data.color).toBe("#4F46E5");
  });

  it("passes explicit color through to the insert", async () => {
    workspaceFindUniqueMock.mockResolvedValueOnce(null);
    workspaceCreateMock.mockResolvedValueOnce({
      id: "ws_3",
      name: "x",
      slug: "demo3",
      color: "#112233",
      iconUrl: null,
    });

    await createWorkspace("user_1", {
      name: "x",
      slug: "demo3",
      color: "#112233",
    });

    const arg = workspaceCreateMock.mock.calls[0]?.[0] as {
      data: { color: string };
    };
    expect(arg.data.color).toBe("#112233");
  });
});
