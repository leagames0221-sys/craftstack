/**
 * Next.js instrumentation hook — see apps/knowledge/src/instrumentation.ts
 * for the full rationale. DSN-gated so the app runs without Sentry;
 * when SENTRY_DSN is set, server errors flow into the configured
 * project. No webpack plugin / source-map upload here; promoting to
 * the full integration is deferred until CI secrets wire an auth
 * token (ADR-0044).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment:
        process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA,
    });
  } catch (err) {
    console.warn(
      "[instrumentation] Sentry init skipped:",
      (err as Error).message,
    );
  }
}
