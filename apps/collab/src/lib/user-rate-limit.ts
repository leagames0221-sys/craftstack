/**
 * Per-user sliding-window rate limiter for authenticated read-heavy
 * endpoints (search, notifications poll). These routes are already
 * auth-gated so an attacker needs a valid OAuth session, but a single
 * malicious account could still spam them and burn through Neon compute
 * hours. The real purpose is UX protection — "you can't DoS the feed
 * from one signed-in tab" — not cost protection, because Neon's free
 * tier hard-caps at zero dollars.
 *
 * In-memory, per-container. See global-budget.ts for the same caveats.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  // Keep the Map small on hot containers — drop entries whose window has
  // already elapsed. Cheap amortized cost since we run it only when we
  // touch the Map.
  if (buckets.size < 1024) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export type UserLimitCheck =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function checkUserLimit(
  namespace: string,
  userId: string,
  windowMs: number,
  cap: number,
  now = Date.now(),
): UserLimitCheck {
  cleanup(now);
  const key = `${namespace}:${userId}`;
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: cap - 1 };
  }
  if (existing.count >= cap) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }
  existing.count += 1;
  return { ok: true, remaining: cap - existing.count };
}

export function _resetUserLimitForTests() {
  buckets.clear();
}
