/**
 * Global invocation budget for cost-sensitive Knowlex endpoints
 * (`/api/kb/ask`, `/api/kb/ingest`). Defense-in-depth on top of:
 *   - Google AI Studio's free-tier RPD cap
 *   - the per-IP sliding-window limiter in kb-rate-limit.ts
 *
 * Goal: even if `GEMINI_API_KEY` is ever rotated to a billing-enabled
 * Google Cloud key (vs. the free-tier AI Studio key Knowlex ships
 * with), and an attacker rotates IPs, the monthly spend stays bounded
 * by this hard cap rather than by the attacker's patience.
 *
 * Storage is in-process memory. On Vercel serverless this means the
 * cap is enforced per warm container, not globally across the fleet.
 * That's a meaningful bound for a portfolio deploy; production would
 * move this to Vercel KV or Upstash. Tuning knobs match the collab
 * playground (KB_BUDGET_PER_DAY / KB_BUDGET_PER_MONTH env vars) so a
 * shared budget ceiling covers both deployments when the operator sets
 * them explicitly.
 */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

function readPositiveInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function limits() {
  return {
    perDay: readPositiveInt("KB_BUDGET_PER_DAY", 800),
    perMonth: readPositiveInt("KB_BUDGET_PER_MONTH", 10_000),
  };
}

export type BudgetCheck =
  | { ok: true; remainingDay: number; remainingMonth: number }
  | { ok: false; scope: "day" | "month"; retryAfterSeconds: number };

function step(
  key: string,
  windowMs: number,
  cap: number,
  now: number,
): { ok: boolean; remaining: number; retryAfterSeconds: number } {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: cap - 1, retryAfterSeconds: 0 };
  }
  if (existing.count >= cap) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: cap - existing.count,
    retryAfterSeconds: 0,
  };
}

function peek(
  key: string,
  windowMs: number,
  cap: number,
  now: number,
): { ok: boolean; retryAfter: number } {
  const e = buckets.get(key);
  if (!e || e.resetAt <= now) return { ok: true, retryAfter: 0 };
  if (e.count >= cap) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((e.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Increment the day and month counters atomically. If EITHER cap is
 * already saturated, refuse without mutating — otherwise a depleted
 * month would also block the still-available day counter at the start
 * of the following month.
 */
export function checkAndIncrementGlobalBudget(
  namespace: string,
  now = Date.now(),
): BudgetCheck {
  const cfg = limits();
  const dayKey = `${namespace}:day`;
  const monthKey = `${namespace}:month`;

  const dayPeek = peek(dayKey, DAY_MS, cfg.perDay, now);
  if (!dayPeek.ok)
    return { ok: false, scope: "day", retryAfterSeconds: dayPeek.retryAfter };
  const monthPeek = peek(monthKey, MONTH_MS, cfg.perMonth, now);
  if (!monthPeek.ok)
    return {
      ok: false,
      scope: "month",
      retryAfterSeconds: monthPeek.retryAfter,
    };

  const dayStep = step(dayKey, DAY_MS, cfg.perDay, now);
  const monthStep = step(monthKey, MONTH_MS, cfg.perMonth, now);

  return {
    ok: true,
    remainingDay: dayStep.remaining,
    remainingMonth: monthStep.remaining,
  };
}

/**
 * Read-only snapshot of current counters for a namespace. Used by
 * `/api/kb/budget` to expose the budget state as an observability
 * surface (matches the shape of `/api/kb/stats`). Never mutates.
 *
 * `used` is the count consumed in the current window; `cap` is the
 * configured ceiling; `resetInSeconds` is how long until the window
 * rolls over. When the window has never been opened (no traffic yet or
 * expired), `used = 0` and `resetInSeconds = 0`.
 */
export type BudgetWindowSnapshot = {
  used: number;
  cap: number;
  resetInSeconds: number;
};

export type BudgetNamespaceSnapshot = {
  day: BudgetWindowSnapshot;
  month: BudgetWindowSnapshot;
};

function snapshotWindow(
  key: string,
  cap: number,
  now: number,
): BudgetWindowSnapshot {
  const e = buckets.get(key);
  if (!e || e.resetAt <= now) {
    return { used: 0, cap, resetInSeconds: 0 };
  }
  return {
    used: e.count,
    cap,
    resetInSeconds: Math.max(0, Math.ceil((e.resetAt - now) / 1000)),
  };
}

export function snapshotBudget(
  namespace: string,
  now = Date.now(),
): BudgetNamespaceSnapshot {
  const cfg = limits();
  return {
    day: snapshotWindow(`${namespace}:day`, cfg.perDay, now),
    month: snapshotWindow(`${namespace}:month`, cfg.perMonth, now),
  };
}

export function _resetForTests() {
  buckets.clear();
}

export const _configForTests = { DAY_MS, MONTH_MS };
