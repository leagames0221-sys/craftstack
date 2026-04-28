"use client";

import PusherClient from "pusher-js";

/**
 * Single-shared Pusher client on the browser. Returns `null` when the public
 * env vars are missing so callers can skip subscribing gracefully (e.g. local
 * dev without a Pusher account).
 *
 * Configures `authEndpoint` so that subscribing to `private-*` channels
 * triggers a POST to `/api/pusher/auth` for server-signed authorization
 * (ADR-0060 — replaces the v0.5.10-and-earlier public `board-<id>` channels
 * whose defence was access-control-by-id-secrecy / T-01 honest-disclose).
 * The auth endpoint shares the same Auth.js cookie as the rest of the API,
 * so the browser-side fetch to `/api/pusher/auth` is automatically
 * authenticated for the signed-in user.
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
  cached = new PusherClient(key, {
    cluster,
    authEndpoint: "/api/pusher/auth",
    // `same-origin` ensures the Auth.js session cookie is sent with the
    // auth POST; `omit` would drop it and every private subscribe would 401.
    auth: {
      params: {},
      headers: {},
    },
  });
  return cached;
}
