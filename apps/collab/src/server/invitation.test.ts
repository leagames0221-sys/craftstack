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

vi.mock("@/lib/db", () => ({
  prisma: {
    invitation: {
      findUnique: (a: unknown) => invFindUnique(a),
      update: (a: unknown) => invUpdate(a),
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

const { acceptInvitation } = await import("./invitation");

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
