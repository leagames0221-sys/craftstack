"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Knowlex global error boundary. Forwards uncaught render errors to
 * Sentry when the browser SDK has been booted by
 * `src/instrumentation-client.ts`; silently no-ops when
 * `NEXT_PUBLIC_SENTRY_DSN` is unset so free-tier deployments stay
 * observable through server logs alone.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
    // Unified observability — forwards to Sentry when DSN set, and
    // also stashes into the in-memory ring surfaced at
    // /api/observability/captures so reviewers without a Sentry
    // account can still prove the pipeline works.
    void import("@/lib/observability").then(({ captureError }) =>
      captureError(error, { route: "error.tsx" }),
    );
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold tracking-tight text-red-400">500</p>
        <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-400">
          An unexpected error occurred. Our team has been notified.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-neutral-600">
            reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
