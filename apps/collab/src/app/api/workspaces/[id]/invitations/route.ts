import { auth } from "@/auth";
import { handle, json } from "@/lib/api";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { createInvitation, listInvitations } from "@/server/invitation";
import { sendInvitationEmail } from "@/lib/email";
import { prisma } from "@/lib/db";

export const GET = handle(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;
    const rows = await listInvitations(session.user.id, id);
    return json(rows);
  },
);

/**
 * Body: { email: string, role: "ADMIN" | "EDITOR" | "VIEWER" }
 * Response: { id, email, role, expiresAt, acceptUrl }
 *
 * The plaintext token is surfaced exactly once in the response so the caller
 * can display / copy it. It is also embedded in the email body when Resend
 * is configured.
 */
export const POST = handle(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user) throw new UnauthorizedError();
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      role?: unknown;
    };
    const email = typeof body.email === "string" ? body.email : "";
    const roleRaw = typeof body.role === "string" ? body.role : "EDITOR";
    if (!["ADMIN", "EDITOR", "VIEWER"].includes(roleRaw)) {
      throw new BadRequestError("Invalid role", {
        fieldErrors: { role: "must be ADMIN | EDITOR | VIEWER" },
      });
    }
    const role = roleRaw as "ADMIN" | "EDITOR" | "VIEWER";

    const invite = await createInvitation(session.user.id, id, { email, role });

    // Fire off the email best-effort — delivery failure / missing API key
    // must not fail the invite itself (token is still usable via acceptUrl).
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id },
      select: { name: true },
    });
    const inviter = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });
    const origin = getRequestOrigin(req);
    const acceptUrl = `${origin}/invite/${invite.token}`;
    await sendInvitationEmail({
      to: invite.email,
      inviterName: inviter?.name ?? null,
      workspaceName: ws.name,
      acceptUrl,
    }).catch(() => void 0);

    return json(
      {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        acceptUrl,
      },
      { status: 201 },
    );
  },
);

function getRequestOrigin(req: Request): string {
  const envOrigin = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
  if (envOrigin) return envOrigin.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
