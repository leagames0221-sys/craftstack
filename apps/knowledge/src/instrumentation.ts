/**
 * Next.js instrumentation hook.
 *
 * When `SENTRY_DSN` is set, boots the Sentry server SDK so runtime
 * errors, unhandled rejections, and `captureException()` calls are
 * surfaced in the Sentry project. When the env var is absent the hook
 * is a no-op — the app still runs end-to-end with no Sentry account,
 * keeping the zero-cost-on-free-tier guarantee.
 *
 * We intentionally skip the `@sentry/nextjs` webpack plugin (source
 * map uploads, auto-instrumented API-route wrappers) because that
 * path requires a Sentry auth token at build time and we want builds
 * to work without any Sentry configuration at all. Captures still
 * arrive; stack traces are minified but usable. Promoting to the full
 * integration is a follow-up when an auth token is wired into CI
 * secrets (see ADR-0044).
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
    // Missing @sentry/nextjs, or init failure — never take the app
    // down because of an observability layer.
    console.warn(
      "[instrumentation] Sentry init skipped:",
      (err as Error).message,
    );
  }
}
