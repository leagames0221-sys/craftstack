/**
 * Per-IP sliding-window rate limiter for Knowlex `/api/kb/ask` and
 * `/api/kb/ingest`. Mirrors the playground limiter in apps/collab so
 * both deployments share the same free-tier protection story (see
 * COST_SAFETY.md). In-memory and single-instance — this is a cost
 * guard, not a global quota system; a distributed limiter would be
 * the right call once the stack graduates off Vercel Hobby.
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const buckets = new Map<string, Bucket>();

export type RateCheck =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSeconds: number };

export function checkAndIncrement(ip: string, now = Date.now()): RateCheck {
  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return {
      ok: true,
      remaining: MAX_PER_WINDOW - 1,
      resetAt: now + WINDOW_MS,
    };
  }
  if (existing.count >= MAX_PER_WINDOW) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: MAX_PER_WINDOW - existing.count,
    resetAt: existing.resetAt,
  };
}

export function _resetForTests() {
  buckets.clear();
}

export const _config = { WINDOW_MS, MAX_PER_WINDOW };
