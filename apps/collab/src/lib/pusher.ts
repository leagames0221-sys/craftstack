import Pusher from "pusher";

/**
 * Server-side Pusher broadcaster. Initialised lazily on first use so the app
 * keeps booting in environments (local dev, preview deploys, CI) that don't
 * have Pusher credentials configured — in that case `trigger()` is a no-op.
 *
 * Channel naming convention: `board-<boardId>` for per-board fanout.
 */

let cached: Pusher | null | undefined;

function getClient(): Pusher | null {
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
  const client = getClient();
  if (!client) return;
  try {
    await client.trigger(`board-${boardId}`, event.kind, { ...event, actorId });
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
