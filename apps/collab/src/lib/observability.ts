/**
 * Unified error-capture seam. Two backends, selected at runtime:
 *
 *  - **Sentry** — when `SENTRY_DSN` (server) or
 *    `NEXT_PUBLIC_SENTRY_DSN` (client) is set and the
 *    `@sentry/nextjs` SDK has been initialised by
 *    `src/instrumentation.ts` / `instrumentation-client.ts`. Every
 *    captured error flows upstream into the configured Sentry
 *    project.
 *
 *  - **In-memory ring buffer** — when no DSN is configured. Holds
 *    the last N captures per process so that a reviewer without a
 *    Sentry account can still prove the pipe is wired end-to-end by
 *    pointing their browser at `/api/observability/captures`. This
 *    is the "zero-cost demo mode" story: the portfolio shows a
 *    working error pipeline without requiring anyone to sign up for
 *    anything.
 *
 * Never throws. Observability must not brick the request path.
 */

const MAX_CAPTURES = 50;

export type Capture = {
  ts: string;
  kind: "error" | "message";
  message: string;
  name?: string;
  digest?: string;
  sourceRoute?: string;
  env: string;
  backend: "sentry" | "memory";
};

const ring: Capture[] = [];

function push(entry: Capture) {
  ring.push(entry);
  if (ring.length > MAX_CAPTURES) ring.shift();
}

function asCapture(
  input: unknown,
  kind: Capture["kind"],
  sourceRoute: string | undefined,
  backend: Capture["backend"],
): Capture {
  const err = input instanceof Error ? input : null;
  const message =
    err?.message ??
    (typeof input === "string" ? input : JSON.stringify(input).slice(0, 500));
  return {
    ts: new Date().toISOString(),
    kind,
    message: message.slice(0, 2000),
    name: err?.name,
    digest: (err as Error & { digest?: string })?.digest,
    sourceRoute,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    backend,
  };
}

/**
 * Forward an exception. Safe to call from any runtime.
 */
export async function captureError(
  err: unknown,
  context?: { route?: string },
): Promise<void> {
  try {
    const dsn =
      process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? null;
    if (dsn) {
      const Sentry = await import("@sentry/nextjs").catch(() => null);
      if (Sentry) {
        Sentry.captureException(err, {
          tags: context?.route ? { route: context.route } : undefined,
        });
        push(asCapture(err, "error", context?.route, "sentry"));
        return;
      }
    }
    push(asCapture(err, "error", context?.route, "memory"));
  } catch {
    // Intentional: observability must never take the caller down.
  }
}

export function recentCaptures(): Capture[] {
  // Returns a shallow copy so callers can't mutate the ring.
  return ring.slice().reverse();
}

export function _resetCapturesForTests() {
  ring.length = 0;
}
