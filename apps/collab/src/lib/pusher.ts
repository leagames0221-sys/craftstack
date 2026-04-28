import Pusher from "pusher";

/**
 * Server-side Pusher broadcaster. Initialised lazily on first use so the app
 * keeps booting in environments (local dev, preview deploys, CI) that don't
 * have Pusher credentials configured — in that case `trigger()` is a no-op.
 *
 * Channel naming convention: `private-board-<boardId>` for per-board fanout.
 * The `private-` prefix activates Pusher's auth-required channel mode (per
 * ADR-0060, replacing the public `board-<id>` channels of v0.5.10 and earlier
 * — closes T-01 honest-disclose). Subscribers are gated server-side by
 * `/api/pusher/auth`, which signs the channel token only for verified
 * workspace members.
 */

let cached: Pusher | null | undefined;

export function getPusherServer(): Pusher | null {
  if (cached !== undefined) return cached;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    cached = null;
    return null;
  }

  cached = new Pusher({ appId, key, secret, cluster, useTLS: true });
  return cached;
}

/**
 * Build the Pusher channel name for a given board. Centralised so the
 * `private-` prefix (ADR-0060) cannot drift between server-emit and the
 * client subscribe / auth-route allow-list.
 */
export function boardChannelName(boardId: string): string {
  return `private-board-${boardId}`;
}

/**
 * Inverse of boardChannelName: extract a boardId from a channel name, or
 * return null if it isn't a valid board channel. The auth route uses this to
 * decide which board's membership to check before signing the token.
 */
export function parseBoardChannel(channelName: string): string | null {
  // boardId is a Prisma cuid by default — alphanumeric + underscore + hyphen.
  // Anchored match prevents `private-board-x.private-board-y` style smuggling.
  const m = /^private-board-([A-Za-z0-9_-]+)$/.exec(channelName);
  return m ? m[1] : null;
}

export type BoardEvent =
  | { kind: "card.created"; listId: string; cardId: string }
  | { kind: "card.updated"; listId: string; cardId: string }
  | { kind: "card.moved"; fromListId: string; toListId: string; cardId: string }
  | { kind: "card.deleted"; cardId: string }
  | { kind: "list.created"; listId: string }
  | { kind: "list.updated"; listId: string }
  | { kind: "list.deleted"; listId: string };

export async function broadcastBoard(
  boardId: string,
  event: BoardEvent,
  actorId?: string,
): Promise<void> {
  const client = getPusherServer();
  if (!client) return;
  try {
    await client.trigger(boardChannelName(boardId), event.kind, {
      ...event,
      actorId,
    });
  } catch (err) {
    // Broadcasting is best-effort — failures must not break the write
    // that caused them. Log and swallow.
    console.warn("[pusher] broadcast failed", err);
  }
}

export function publicPusherConfig(): { key: string; cluster: string } | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;
  return { key, cluster };
}
