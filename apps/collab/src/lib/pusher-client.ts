"use client";

import PusherClient from "pusher-js";

/**
 * Single-shared Pusher client on the browser. Returns `null` when the public
 * env vars are missing so callers can skip subscribing gracefully (e.g. local
 * dev without a Pusher account).
 */

let cached: PusherClient | null | undefined;

export function getPusherClient(): PusherClient | null {
  if (cached !== undefined) return cached;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) {
    cached = null;
    return null;
  }
  cached = new PusherClient(key, { cluster });
  return cached;
}
