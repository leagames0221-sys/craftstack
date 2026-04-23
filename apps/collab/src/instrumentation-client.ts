/**
 * Next.js client-side instrumentation hook (browser bundle).
 *
 * Runs once per page load in the browser. DSN-gated like the server
 * counterpart in src/instrumentation.ts: if `NEXT_PUBLIC_SENTRY_DSN`
 * is unset, this module short-circuits and costs nothing. When set,
 * it dynamically imports the Sentry browser SDK and boots it so
 * unhandled rejections, React errors that bubble through error.tsx,
 * and explicit `Sentry.captureException()` calls from client code are
 * sent to the configured project.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` is intentionally a separate env var from
 * the server-side `SENTRY_DSN`: Sentry recommends distinct DSNs per
 * runtime so quotas, sample rates, and ingestion rules can be tuned
 * independently. Operators who want the simplest setup can point both
 * at the same DSN.
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
      // Keep the browser bundle lean; the server side remains the
      // primary capture surface. Promote to the full replay / session
      // bundle once a real Sentry project is attached.
      integrations: [],
    });
  } catch (err) {
    // Observability must never brick the page.
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation-client] Sentry init skipped:",
      (err as Error).message,
    );
  }
})();
