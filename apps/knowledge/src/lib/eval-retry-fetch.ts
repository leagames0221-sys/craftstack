/**
 * `retryFetch` — exponential-backoff retry wrapper for the eval script's
 * HTTP calls against the live Knowlex deploy. ADR-0049 documents the
 * regime: under the `$0/mo` design contract (ADR-0016, ADR-0046),
 * Neon Free tier autosuspends compute after low-traffic windows. The
 * first request after a quiet window can fail with a Prisma
 * `Unable to start a transaction in the given time` 500 because the
 * Postgres compute is mid-cold-start while the route handler's
 * transaction-acquire timeout has already fired.
 *
 * The eval cron fires nightly at 04:00 UTC — almost always after a
 * Live-smoke-only quiet window — so this retry is the line of defence
 * between "free-tier reality" and "missed nightly report." Without it,
 * any single cold-start drops the night and the v0.5.1 measured-eval
 * README badge can't ship until three consecutive nights all happen
 * to land warm.
 *
 * Pure module: takes a fetch implementation as a parameter so Vitest
 * can mock the network entirely. Production callers pass `globalThis.fetch`.
 */

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RetryOptions = {
  /**
   * Total attempts including the first. Default 3 — first try plus
   * two retries. The `backoffMs` array indexes by retry number, so
   * length must be at least `attempts - 1`.
   */
  attempts?: number;
  /**
   * Backoff schedule in ms. `backoffMs[0]` is the wait before retry #1,
   * `backoffMs[1]` before retry #2, etc. Default `[2000, 4000]` —
   * matches Neon Free's typical cold-start window (1–6 s observed).
   */
  backoffMs?: number[];
  /**
   * Override the sleep impl for tests (default: real setTimeout-Promise).
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Override the logging impl for tests / silent mode. Receives the
   * human-readable retry breadcrumb. Default: `console.warn`.
   */
  log?: (msg: string) => void;
  /**
   * Optional label used in retry breadcrumbs (e.g., "ingest \"Knowlex
   * RAG architecture\""). Helps distinguish which call retried in the
   * CI log without parsing the URL.
   */
  label?: string;
};

const TRANSIENT_HTTP_STATUSES = new Set([500, 502, 503, 504]);

const TRANSIENT_BODY_MARKERS = [
  // Neon cold-start surfaces this exact wording in the Prisma error.
  "Unable to start a transaction",
  // Generic Postgres connection-not-yet-ready surface.
  "Connection terminated unexpectedly",
  // Vercel function cold-boot timeout fall-through.
  "FUNCTION_INVOCATION_TIMEOUT",
];

/**
 * Inspect a Response (already received, status + body readable) and
 * decide whether the failure is the retry-eligible class. Body-marker
 * detection lets us catch the Prisma-cold-start signature even when
 * the wrapped status is an opaque 500.
 */
async function isRetryableResponse(res: Response): Promise<boolean> {
  if (TRANSIENT_HTTP_STATUSES.has(res.status)) return true;
  // Cheap clone + read so the caller can still consume the body of the
  // last (returned) attempt. clone() is safe because Response is
  // single-consumption only on the original.
  if (res.status >= 400 && res.status < 600) {
    try {
      const peek = await res.clone().text();
      return TRANSIENT_BODY_MARKERS.some((m) => peek.includes(m));
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * `retryFetch(fetchImpl, url, init, options)` — exponential-backoff
 * retry around a fetch-like call. Returns the last Response (whether
 * success or terminal failure) so the caller can inspect status / body
 * / headers identically to a normal fetch.
 *
 * Network errors (fetch reject) are retried as well. The final reject
 * is the last attempt's error.
 */
export async function retryFetch(
  fetchImpl: FetchLike,
  url: string | URL,
  init: RequestInit | undefined,
  options: RetryOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  const backoffMs = options.backoffMs ?? [2000, 4000];
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log = options.log ?? ((m: string) => console.warn(m));
  const label = options.label ? ` [${options.label}]` : "";

  let lastErr: unknown = null;
  let lastRes: Response | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, init);
      // Success path — don't pay for body inspection if the status is OK.
      if (res.ok) return res;

      const retryable = await isRetryableResponse(res);
      if (!retryable || i === attempts - 1) {
        return res;
      }

      lastRes = res;
      const wait = backoffMs[i] ?? backoffMs[backoffMs.length - 1];
      log(
        `[retryFetch]${label} attempt ${i + 1}/${attempts} got ${res.status}; ` +
          `retrying in ${wait}ms (Neon cold-start suspected)`,
      );
      await sleep(wait);
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) {
        throw err;
      }
      const wait = backoffMs[i] ?? backoffMs[backoffMs.length - 1];
      log(
        `[retryFetch]${label} attempt ${i + 1}/${attempts} threw ${
          err instanceof Error ? err.message : String(err)
        }; retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }

  // Unreachable in normal flow — the loop returns or throws on the last
  // attempt. This is a defensive fall-through for type narrowing.
  if (lastRes) return lastRes;
  throw lastErr ?? new Error("retryFetch: exhausted attempts with no result");
}
