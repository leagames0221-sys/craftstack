import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/auth/rbac";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "@/lib/errors";
import { hashToken, issueToken } from "@/lib/tokens";
import { inviteLimits } from "@/lib/rate-limit";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

/**
 * Fan out three `createdAt` count queries (global / workspace / user) in
 * parallel and raise the first `RateLimitError` whose quota is blown. We
 * count the full `Invitation` table — including accepted and revoked rows —
 * because an attacker could otherwise spam revokes to reset their quota.
 */
async function enforceInviteRateLimits(inviterId: string, workspaceId: string) {
  const limits = inviteLimits();
  const now = Date.now();
  const monthAgo = new Date(now - MONTH_MS);
  const dayAgo = new Date(now - DAY_MS);

  const [globalCount, workspaceCount, userCount] = await Promise.all([
    prisma.invitation.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.invitation.count({
      where: { workspaceId, createdAt: { gte: dayAgo } },
    }),
    prisma.invitation.count({
      where: { inviterId, createdAt: { gte: dayAgo } },
    }),
  ]);

  if (globalCount >= limits.globalPerMonth) {
    throw new RateLimitError(
      "RATE_LIMIT_GLOBAL",
      "Monthly invitation cap reached for this instance. Try again later.",
      { limit: limits.globalPerMonth, windowHours: 24 * 30 },
    );
  }
  if (workspaceCount >= limits.perWorkspacePerDay) {
    throw new RateLimitError(
      "RATE_LIMIT_WORKSPACE",
      "Daily invitation cap reached for this workspace.",
      { limit: limits.perWorkspacePerDay, windowHours: 24 },
    );
  }
  if (userCount >= limits.perUserPerDay) {
    throw new RateLimitError(
      "RATE_LIMIT_USER",
      "You have sent too many invitations today. Try again tomorrow.",
      { limit: limits.perUserPerDay, windowHours: 24 },
    );
  }
}

/**
 * Create an invitation. Returns the plaintext token exactly once so the caller
 * can put it in the email body / UI; afterwards only the hash is retrievable.
 * Requires ADMIN+ on the workspace.
 */
export async function createInvitation(
  inviterId: string,
  workspaceId: string,
  input: { email: string; role: Role },
): Promise<{
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  token: string;
}> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError("Invalid email", {
      fieldErrors: { email: "invalid" },
    });
  }
  if (input.role === "OWNER") {
    throw new BadRequestError("Cannot invite as OWNER", {
      fieldErrors: { role: "invalid" },
    });
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    include: {
      memberships: { where: { userId: inviterId }, select: { role: true } },
    },
  });
  if (!ws) throw new NotFoundError("Workspace");
  const inviterRole = ws.memberships[0]?.role;
  if (!inviterRole || !roleAtLeast(inviterRole, "ADMIN")) {
    throw new ForbiddenError("INVITE_DENIED");
  }

  const existingMember = await prisma.user.findFirst({
    where: {
      email,
      memberships: { some: { workspaceId } },
    },
    select: { id: true },
  });
  if (existingMember) {
    throw new ConflictError(
      "ALREADY_MEMBER",
      "This user is already a member of the workspace.",
    );
  }

  await enforceInviteRateLimits(inviterId, workspaceId);

  const activeInvite = await prisma.invitation.findFirst({
    where: {
      workspaceId,
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (activeInvite) {
    throw new ConflictError(
      "INVITE_PENDING",
      "An active invitation already exists for this email.",
    );
  }

  const { token, tokenHash } = issueToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const row = await prisma.invitation.create({
    data: {
      workspaceId,
      inviterId,
      email,
      tokenHash,
      role: input.role,
      expiresAt,
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  return { ...row, token };
}

export async function listInvitations(userId: string, workspaceId: string) {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    include: {
      memberships: { where: { userId }, select: { role: true } },
    },
  });
  if (!ws) throw new NotFoundError("Workspace");
  const role = ws.memberships[0]?.role;
  if (!role || !roleAtLeast(role, "ADMIN")) {
    throw new ForbiddenError("INVITE_LIST_DENIED");
  }

  return prisma.invitation.findMany({
    where: {
      workspaceId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
  });
}

export async function revokeInvitation(userId: string, invitationId: string) {
  const inv = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: {
      workspace: {
        include: {
          memberships: { where: { userId }, select: { role: true } },
        },
      },
    },
  });
  if (!inv) throw new NotFoundError("Invitation");
  const role = inv.workspace.memberships[0]?.role;
  if (!role || !roleAtLeast(role, "ADMIN")) {
    throw new ForbiddenError("INVITE_REVOKE_DENIED");
  }
  if (inv.acceptedAt) {
    throw new ConflictError(
      "INVITE_ACCEPTED",
      "Invitation has already been accepted.",
    );
  }
  await prisma.invitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Accept an invitation by its plaintext token. Creates the membership if and
 * only if the token hash matches an invitation that is not expired / accepted
 * / revoked. The acting user's email must match the invitation target
 * (otherwise an attacker who guesses or phishes a token could join as anyone).
 */
export async function acceptInvitation(
  userId: string,
  userEmail: string,
  plainToken: string,
): Promise<{ workspaceId: string; workspaceSlug: string; role: Role }> {
  const tokenHash = hashToken(plainToken);
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      workspace: { select: { id: true, slug: true } },
    },
  });
  if (!inv) throw new NotFoundError("Invitation");
  if (inv.revokedAt) {
    throw new ConflictError("INVITE_REVOKED", "Invitation was revoked.");
  }
  if (inv.acceptedAt) {
    throw new ConflictError(
      "INVITE_ALREADY_ACCEPTED",
      "Invitation has already been accepted.",
    );
  }
  if (inv.expiresAt.getTime() < Date.now()) {
    throw new ConflictError("INVITE_EXPIRED", "Invitation has expired.");
  }
  if (inv.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new ForbiddenError(
      "INVITE_EMAIL_MISMATCH",
      "This invitation was issued for a different email address.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    });
    await tx.membership.upsert({
      where: {
        userId_workspaceId: { userId, workspaceId: inv.workspaceId },
      },
      create: {
        userId,
        workspaceId: inv.workspaceId,
        role: inv.role,
      },
      update: {},
    });
  });

  return {
    workspaceId: inv.workspaceId,
    workspaceSlug: inv.workspace.slug,
    role: inv.role,
  };
}
