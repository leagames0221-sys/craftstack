import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth() entrypoint and prisma client before importing
// access.ts so the module-level imports pick up the mocks.
const mockAuth = vi.fn();
const mockMembershipFindUnique = vi.fn();
const mockMembershipUpsert = vi.fn();

vi.mock("./index", () => ({
  auth: mockAuth,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    membership: {
      findUnique: mockMembershipFindUnique,
      upsert: mockMembershipUpsert,
    },
  },
}));

const accessModule = await import("./access");
const {
  DEMO_WORKSPACE_ID,
  WorkspaceAccessError,
  requireDemoOrMember,
  requireMemberForWrite,
} = accessModule;

beforeEach(() => {
  mockAuth.mockReset();
  mockMembershipFindUnique.mockReset();
  mockMembershipUpsert.mockReset();
});

describe("requireDemoOrMember (read-side gate)", () => {
  it("returns kind=anonymous-demo for the seeded demo workspace, even without a session", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const got = await requireDemoOrMember(DEMO_WORKSPACE_ID);
    expect(got).toEqual({
      kind: "anonymous-demo",
      workspaceId: DEMO_WORKSPACE_ID,
      userId: null,
    });
    // No session check, no DB query for the demo workspace.
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("throws UNAUTHENTICATED (401) when an anonymous caller targets a non-demo workspace", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await expect(requireDemoOrMember("wks_other")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("throws NOT_A_MEMBER (403) when a signed-in user has no Membership row for the workspace", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mockMembershipFindUnique.mockResolvedValueOnce(null);
    await expect(requireDemoOrMember("wks_private")).rejects.toMatchObject({
      code: "NOT_A_MEMBER",
      status: 403,
    });
  });

  it("returns kind=member when the signed-in user has a Membership row", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mockMembershipFindUnique.mockResolvedValueOnce({ role: "OWNER" });
    const got = await requireDemoOrMember("wks_private");
    expect(got).toEqual({
      kind: "member",
      workspaceId: "wks_private",
      userId: "u1",
    });
  });
});

describe("requireMemberForWrite (write-side gate)", () => {
  it("rejects anonymous writes to the demo workspace (cost-attack defence)", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await expect(
      requireMemberForWrite(DEMO_WORKSPACE_ID),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(mockMembershipUpsert).not.toHaveBeenCalled();
  });

  it("rejects anonymous writes to any non-demo workspace", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await expect(requireMemberForWrite("wks_x")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("auto-grants OWNER membership for signed-in writes to the demo workspace", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mockMembershipUpsert.mockResolvedValueOnce({ id: "m1" });
    const got = await requireMemberForWrite(DEMO_WORKSPACE_ID);
    expect(got).toEqual({ userId: "u1", workspaceId: DEMO_WORKSPACE_ID });
    expect(mockMembershipUpsert).toHaveBeenCalledWith({
      where: {
        userId_workspaceId: { userId: "u1", workspaceId: DEMO_WORKSPACE_ID },
      },
      update: {},
      create: {
        userId: "u1",
        workspaceId: DEMO_WORKSPACE_ID,
        role: "OWNER",
      },
    });
  });

  it("rejects signed-in writes to a non-demo workspace without membership (NOT_A_MEMBER)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mockMembershipFindUnique.mockResolvedValueOnce(null);
    await expect(requireMemberForWrite("wks_other")).rejects.toMatchObject({
      code: "NOT_A_MEMBER",
      status: 403,
    });
  });

  it("returns userId + workspaceId on signed-in writes to a member-of workspace", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    mockMembershipFindUnique.mockResolvedValueOnce({ role: "OWNER" });
    const got = await requireMemberForWrite("wks_member");
    expect(got).toEqual({ userId: "u1", workspaceId: "wks_member" });
  });
});

describe("WorkspaceAccessError", () => {
  it("carries code + status as discriminable fields", () => {
    const err = new WorkspaceAccessError("UNAUTHENTICATED", 401);
    expect(err.code).toBe("UNAUTHENTICATED");
    expect(err.status).toBe(401);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WorkspaceAccessError");
  });
});
