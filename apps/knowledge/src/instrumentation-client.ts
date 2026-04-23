/**
 * Next.js client-side instrumentation hook for Knowlex. Mirrors
 * apps/collab/src/instrumentation-client.ts — see that file for the
 * full rationale. DSN-gated so the browser bundle costs nothing when
 * `NEXT_PUBLIC_SENTRY_DSN` is unset.
 */
(async () => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: Number(
        process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
      ),
      environment:
        process.env.NEXT_PUBLIC_VERCEL_ENV ??
        process.env.NODE_ENV ??
        "development",
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      integrations: [],
    });
  } catch (err) {
    console.warn(
      "[instrumentation-client] Sentry init skipped:",
      (err as Error).message,
    );
  }
})();
