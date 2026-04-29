import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

/**
 * Static security headers applied to every response.
 *
 * CSP note: the previous iteration set a per-request nonce-based policy
 * from the Next proxy (`src/proxy.ts`) with `'strict-dynamic'` for an
 * A+ score on securityheaders.com. That interacted badly with Vercel's
 * platform-injected scripts (Speed Insights, preview toolbar, some Next
 * chunks) which don't carry our nonce, and hydration failed silently on
 * every interactive page. Rolled back to a static CSP here. Mild grade
 * regression to A; interactive surfaces work.
 *
 * Both `'unsafe-inline'` AND `'unsafe-eval'` appear in `script-src`:
 *   - `'unsafe-inline'`: Next bundler emits inline bootstrap scripts
 *     that don't carry a stable hash across deploys
 *   - `'unsafe-eval'`: Vercel Speed Insights uses `eval` / `new Function`
 *     at runtime
 * Both are documented in ADR-0040 § Decision + § Consequences and
 * pinned by `scripts/check-csp-coherence.mjs` (ADR-0068 § Finding C
 * closure) — which asserts the README CSP description mentions every
 * load-bearing directive present in this constant. If you change the
 * CSP here, expect the gate to fail until you also update README:175.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-insights.com https://*.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.pusher.com wss://*.pusher.com https://sockjs-*.pusher.com https://vercel.live wss://ws-us3.pusher.com https://vitals.vercel-insights.com https://*.vercel-scripts.com",
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

export default withBundleAnalyzer(nextConfig);
