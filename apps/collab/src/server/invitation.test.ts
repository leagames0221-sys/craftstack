import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { hashToken } from "@/lib/tokens";

type InvRow = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  workspaceId: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  workspace: { id: string; slug: string };
};

const invFindUnique = vi.fn<(args: unknown) => Promise<InvRow | null>>();
const invUpdate = vi.fn<(args: unknown) => Promise<InvRow>>();
const membershipUpsert = vi.fn<(args: unknown) => Promise<unknown>>();

const wsFindFirst = vi.fn<(args: unknown) => Promise<unknown>>();
const userFindFirst = vi.fn<(args: unknown) => Promise<unknown>>();
const invFindFirst = vi.fn<(args: unknown) => Promise<unknown>>();
const invCreate = vi.fn<(args: unknown) => Promise<InvRow>>();
const invCount = vi.fn<(args: unknown) => Promise<number>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    invitation: {
      findUnique: (a: unknown) => invFindUnique(a),
      findFirst: (a: unknown) => invFindFirst(a),
      update: (a: unknown) => invUpdate(a),
      create: (a: unknown) => invCreate(a),
      count: (a: unknown) => invCount(a),
    },
    workspace: {
      findFirst: (a: unknown) => wsFindFirst(a),
    },
    user: {
      findFirst: (a: unknown) => userFindFirst(a),
    },
    membership: {
      upsert: (a: unknown) => membershipUpsert(a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        invitation: {
          update: (a: unknown) => invUpdate(a),
        },
        membership: {
          upsert: (a: unknown) => membershipUpsert(a),
        },
      }),
  },
}));

const { acceptInvitation, createInvitation } = await import("./invitation");

const PLAIN = "the-plaintext-token";
const HASH = hashToken(PLAIN);

function baseInv(overrides: Partial<InvRow> = {}): InvRow {
  return {
    id: "inv1",
    email: "invitee@example.com",
    role: "EDITOR",
    workspaceId: "ws1",
    tokenHash: HASH,
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    revokedAt: null,
    workspace: { id: "ws1", slug: "acme" },
    ...overrides,
  };
}

beforeEach(() => {
  invFindUnique.mockReset();
  invUpdate.mockReset();
  membershipUpsert.mockReset();
  wsFindFirst.mockReset();
  userFindFirst.mockReset();
  invFindFirst.mockReset();
  invCreate.mockReset();
  invCount.mockReset();
  // Clear env overrides so every test starts from default limits.
  delete process.env.INVITE_LIMIT_GLOBAL_PER_MONTH;
  delete process.env.INVITE_LIMIT_WORKSPACE_PER_DAY;
  delete process.env.INVITE_LIMIT_USER_PER_DAY;
});

describe("createInvitation rate limits", () => {
  const setupAdmin = () => {
    wsFindFirst.mockResolvedValueOnce({
      id: "ws1",
      memberships: [{ role: "ADMIN" }],
    });
    userFindFirst.mockResolvedValueOnce(null); // not already a member
    invFindFirst.mockResolvedValueOnce(null); // no active invite
  };

  it("rejects when global monthly cap is reached", async () => {
    process.env.INVITE_LIMIT_GLOBAL_PER_MONTH = "3";
    setupAdmin();
    // global, workspace, user counts (in that order)
    invCount.mockResolvedValueOnce(3);
    invCount.mockResolvedValueOnce(0);
    invCount.mockResolvedValueOnce(0);

    await expect(
      createInvitation("inviter1", "ws1", {
        email: "a@b.com",
        role: "EDITOR",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMIT_GLOBAL", status: 429 });
  });

  it("rejects when workspace daily cap is reached", async () => {
    process.env.INVITE_LIMIT_WORKSPACE_PER_DAY = "2";
    setupAdmin();
    invCount.mockResolvedValueOnce(0);
    invCount.mockResolvedValueOnce(2);
    invCount.mockResolvedValueOnce(0);

    await expect(
      createInvitation("inviter1", "ws1", {
        email: "a@b.com",
        role: "EDITOR",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMIT_WORKSPACE", status: 429 });
  });

  it("rejects when per-user daily cap is reached", async () => {
    process.env.INVITE_LIMIT_USER_PER_DAY = "5";
    setupAdmin();
    invCount.mockResolvedValueOnce(0);
    invCount.mockResolvedValueOnce(0);
    invCount.mockResolvedValueOnce(5);

    await expect(
      createInvitation("inviter1", "ws1", {
        email: "a@b.com",
        role: "EDITOR",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMIT_USER", status: 429 });
  });

  it("passes rate-limit gate and creates when counts are below caps", async () => {
    setupAdmin();
    invCount.mockResolvedValueOnce(0);
    invCount.mockResolvedValueOnce(0);
    invCount.mockResolvedValueOnce(0);
    invCreate.mockResolvedValueOnce({
      id: "inv-new",
      email: "a@b.com",
      role: "EDITOR",
      expiresAt: new Date(Date.now() + 86_400_000),
    } as unknown as InvRow);

    const out = await createInvitation("inviter1", "ws1", {
      email: "a@b.com",
      role: "EDITOR",
    });
    expect(out.id).toBe("inv-new");
    expect(out.token).toMatch(/.{20,}/); // non-trivial token issued
  });
});

describe("acceptInvitation", () => {
  it("creates membership when token + email match", async () => {
    invFindUnique.mockResolvedValueOnce(baseInv());
    invUpdate.mockResolvedValueOnce(baseInv({ acceptedAt: new Date() }));
    membershipUpsert.mockResolvedValueOnce({});

    const out = await acceptInvitation("user1", "invitee@example.com", PLAIN);
    expect(out).toEqual({
      workspaceId: "ws1",
      workspaceSlug: "acme",
      role: "EDITOR",
    });
    expect(membershipUpsert).toHaveBeenCalledOnce();
  });

  it("is case-insensitive on email", async () => {
    invFindUnique.mockResolvedValueOnce(
      baseInv({ email: "Invitee@Example.com" }),
    );
    invUpdate.mockResolvedValueOnce(baseInv());
    membershipUpsert.mockResolvedValueOnce({});

    await expect(
      acceptInvitation("user1", "invitee@example.COM", PLAIN),
    ).resolves.toMatchObject({ workspaceId: "ws1" });
  });

  it("rejects when token is unknown (hash miss)", async () => {
    invFindUnique.mockResolvedValueOnce(null);
    await expect(
      acceptInvitation("user1", "invitee@example.com", "wrong-token"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects when email does not match", async () => {
    invFindUnique.mockResolvedValueOnce(baseInv());
    await expect(
      acceptInvitation("user1", "other@example.com", PLAIN),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects already-accepted invitation", async () => {
    invFindUnique.mockResolvedValueOnce(
      baseInv({ acceptedAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      acceptInvitation("user1", "invitee@example.com", PLAIN),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects revoked invitation", async () => {
    invFindUnique.mockResolvedValueOnce(
      baseInv({ revokedAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      acceptInvitation("user1", "invitee@example.com", PLAIN),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects expired invitation", async () => {
    invFindUnique.mockResolvedValueOnce(
      baseInv({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      acceptInvitation("user1", "invitee@example.com", PLAIN),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
