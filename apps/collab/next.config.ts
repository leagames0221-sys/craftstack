import type { NextConfig } from "next";

/**
 * Strict security headers, targeted at an `A+` rating on
 * https://securityheaders.com/. Each origin allowed by the CSP has a
 * concrete reason; do not add wildcards without noting why here.
 *
 * External origins intentionally allowed:
 *   - https://*.pusher.com, wss://*.pusher.com  — Pusher Channels (realtime)
 *   - https://sockjs-*.pusher.com                — Pusher SockJS fallback
 *   - https://avatars.githubusercontent.com      — GitHub OAuth avatar
 *   - https://lh3.googleusercontent.com          — Google OAuth avatar
 *   - https://vercel.live, https://*.vercel.live — Vercel preview toolbar
 *
 * `unsafe-inline` for style-src is required for Tailwind 4 + the style tags
 * that Next.js App Router injects for server components. `unsafe-inline` on
 * script-src covers the per-request RSC bootstrap; we accept the tradeoff
 * for now — the full nonce-based CSP pipeline is tracked as a follow-up
 * (would require a proxy-level nonce injector).
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://vercel.live",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.pusher.com wss://*.pusher.com https://sockjs-*.pusher.com https://vercel.live wss://ws-us3.pusher.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
