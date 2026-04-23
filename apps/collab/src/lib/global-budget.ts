/**
 * Global invocation budget for cost-sensitive endpoints (chiefly /api/kb/ask
 * which may talk to a paid-tier Gemini key). This is a defense-in-depth
 * layer ON TOP OF:
 *   - Google AI Studio's own free-tier RPD cap (safe by default)
 *   - the per-IP sliding-window limiter in kb-rate-limit.ts
 *
 * Goal: even if the operator accidentally wires a billing-enabled Google
 * Cloud key (vs. a free-tier AI Studio key — see COST_SAFETY.md) and an
 * attacker rotates through thousands of IPs, the monthly spend stays
 * bounded by this hard cap rather than by the attacker's patience.
 *
 * Storage is in-process memory. On Vercel serverless this means the cap
 * is enforced *per warm container* — not globally across all containers.
 * That's still a meaningful bound: each container only sees a fraction of
 * traffic, and cold starts reset the counter to zero while the container
 * fleet churns frequently enough that no single container can sustain
 * high throughput for long. The absolute upper bound across the whole
 * fleet is roughly (CAP × container_count). For a kanban-portfolio deploy
 * that's fine; for production we would migrate to Vercel KV or Upstash.
 *
 * Defaults are tuned to be safely under Google AI Studio's free-tier RPD
 * (1500/day) so a free-tier key is never tripped into a billable state by
 * our own guard. Both knobs are env-overridable.
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

/**
 * Increments the day and month counters atomically. If EITHER cap is
 * already saturated we refuse without incrementing the counter that
 * still has headroom — otherwise a depleted month would also block the
 * (still-available) day counter from being useful at the start of next
 * month.
 */
export function checkAndIncrementGlobalBudget(
  namespace: string,
  now = Date.now(),
): BudgetCheck {
  const cfg = limits();

  // Peek both windows without mutating; only increment if BOTH permit.
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

export function _resetForTests() {
  buckets.clear();
}

export const _configForTests = { DAY_MS, MONTH_MS };
