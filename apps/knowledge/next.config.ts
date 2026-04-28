import type { NextConfig } from "next";

/**
 * Build-time assertion (ADR-0065): the CI-only Credentials provider
 * must NEVER be enabled on a Vercel-hosted deploy. The runtime gate in
 * `src/auth/config.ts` (`e2eGateOpen`) is the primary defense — this
 * build-time assertion is a redundant structural check that fails the
 * `next build` step itself if a misconfigured env somehow makes it
 * through. Belt-and-braces: a single env-var typo cannot silently
 * re-enable anonymous-write paths in production.
 */
if (process.env.VERCEL === "1" && process.env.E2E_ENABLED === "1") {
  throw new Error(
    "[next.config] FATAL: E2E_ENABLED=1 is set on a Vercel-hosted build " +
      "(VERCEL=1). The Knowlex CI-only Credentials provider must never " +
      "register on production. Unset E2E_ENABLED on the Vercel project " +
      "Environment Variables page (or remove it from any vercel.json env " +
      "block). See ADR-0065 § Build-time assertion + ADR-0061 line 32 " +
      "(anonymous writes are explicitly disallowed).",
  );
}

/**
 * Static security headers applied to every Knowlex response. Mirrors
 * the Boardly stance (see `apps/collab/next.config.ts` + ADR-0040) so
 * both deployments answer securityheaders.com with the same A-grade
 * surface. Differences from Boardly:
 *   - no Pusher domains (Knowlex is single-user request/response, not
 *     realtime)
 *   - no invite-email domains (ingest is paste-only; no email out)
 *
 * The connect-src entry allows the client to stream the Gemini answer
 * back from our own /api routes; we don't call Gemini from the
 * browser, so no *.googleapis.com entry is needed.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-insights.com https://*.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://vercel.live https://vitals.vercel-insights.com https://*.vercel-scripts.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "sync-xhr=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
