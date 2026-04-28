import { auth } from "@/auth";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/errors";
import { getPusherServer, parseBoardChannel } from "@/lib/pusher";
import { NextResponse } from "next/server";

/**
 * POST /api/pusher/auth — Pusher private-channel authorization endpoint.
 *
 * Pusher posts `socket_id=<id>&channel_name=<name>` (form-encoded) every time
 * a `private-*` channel is subscribed from the browser. This route:
 *   1. Verifies Auth.js session (must be signed in).
 *   2. Verifies the channel name is a recognised `private-board-<id>` shape
 *      (rejects any other private-* request to avoid acting as a generic
 *      Pusher signing oracle).
 *   3. Verifies the user is a workspace member of the board's workspace
 *      (any role — Owner / Admin / Editor / Viewer can all read broadcasts).
 *   4. Signs and returns the auth token via `pusher.authorizeChannel()`.
 *
 * Closes T-01 honest-disclose (public Pusher channels) per [ADR-0060].
 */
export const POST = handle(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  // Pusher's auth POST is application/x-www-form-urlencoded.
  let socketId: string;
  let channelName: string;
  try {
    const form = await req.formData();
    const sid = form.get("socket_id");
    const cn = form.get("channel_name");
    if (typeof sid !== "string" || typeof cn !== "string") {
      throw new BadRequestError("missing socket_id or channel_name");
    }
    socketId = sid;
    channelName = cn;
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError("invalid form body");
  }

  // Allow only the board channel shape; never sign arbitrary private-* names.
  const boardId = parseBoardChannel(channelName);
  if (!boardId) {
    throw new ForbiddenError(
      "UNSUPPORTED_CHANNEL",
      `Only private-board-<id> channels are authorizable; got "${channelName}"`,
    );
  }

  // Workspace membership check via the board's workspace.
  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    include: {
      workspace: {
        include: {
          memberships: {
            where: { userId: session.user.id },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!board || board.workspace.deletedAt) {
    // 403 not 404: don't disclose board existence to non-members.
    throw new ForbiddenError("BOARD_NOT_FOUND", "No access to this channel");
  }
  if (!board.workspace.memberships[0]) {
    throw new ForbiddenError("NOT_A_MEMBER", "No access to this channel");
  }

  const pusher = getPusherServer();
  if (!pusher) {
    // Server is missing PUSHER_* env. The browser shouldn't be reaching this
    // route in that configuration (publicPusherConfig() returns null and
    // pusher-client.ts returns null), but defend anyway: return 503 so a
    // misconfigured deploy fails fast instead of looking like an auth denial.
    return NextResponse.json(
      {
        code: "PUSHER_NOT_CONFIGURED",
        message: "Realtime is not configured on this deploy",
      },
      { status: 503 },
    );
  }

  const authResponse = pusher.authorizeChannel(socketId, channelName);
  return NextResponse.json(authResponse);
});
