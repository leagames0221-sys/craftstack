"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry.captureException will hook in here once wired.
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold tracking-tight text-red-400">500</p>
        <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-400">
          An unexpected error occurred. Our team has been notified.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-neutral-600 font-mono">
            reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
