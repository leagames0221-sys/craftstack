/**
 * Knowlex observability seam. Same two-backend shape as
 * apps/collab/src/lib/observability.ts: forward to Sentry when a DSN
 * is configured, otherwise stash captures in an in-memory ring buffer
 * so reviewers can still prove the error pipeline works without
 * signing up for a Sentry project. See the collab copy for the full
 * rationale; the two modules are deliberate near-duplicates (ADR-0043
 * records the same "copy-don't-package-yet" trade-off for rate
 * limits and global budget).
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
    // Observability must never take the caller down.
  }
}

export function recentCaptures(): Capture[] {
  return ring.slice().reverse();
}

export function _resetCapturesForTests() {
  ring.length = 0;
}
