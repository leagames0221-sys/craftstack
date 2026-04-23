/**
 * Per-IP sliding-window rate limiter for the Knowlex playground. Intentionally
 * in-memory and single-instance — the playground is a demo endpoint, not a
 * production API. The cap exists to stop one visitor from draining the free
 * Gemini quota for everyone else; a distributed limiter would be the right
 * call once we had paid infrastructure.
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
