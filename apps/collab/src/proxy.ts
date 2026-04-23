/**
 * Next.js 16 renamed `middleware` to `proxy`.
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Two jobs:
 *   1. Delegate to Auth.js so unauthenticated users on protected routes
 *      are redirected to `/signin`.
 *   2. Inject a per-request nonce-based Content-Security-Policy for
 *      document responses. The nonce is passed forward via an internal
 *      request header and surfaced to Next so it can decorate the scripts
 *      it injects during SSR. Using a nonce + `strict-dynamic` lets us
 *      drop `'unsafe-inline'` from `script-src` and reach an A+ on
 *      https://securityheaders.com/.
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authEdgeConfig } from "@/auth/config.edge";

const { auth } = NextAuth(authEdgeConfig);

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // Dropped `'strict-dynamic'` — it disables ALL other allowlists
    // (including `'self'`, host names, and `'unsafe-inline'`) and only
    // permits nonced scripts + their transitive loads. That's the
    // ideal A+ stance, but Vercel's platform-injected scripts (Speed
    // Insights, preview toolbar) don't carry our per-request nonce,
    // so hydration silently failed on every interactive page. The
    // pragmatic policy below keeps `'nonce-XXX'` for Next's own
    // scripts, explicitly allowlists the Vercel platform origins, and
    // permits `'unsafe-inline'` as a last-ditch fallback for scripts
    // the edge platform inserts out of our proxy's reach. Security
    // grade drops one notch from A+ to A; functional site wins.
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://vercel.live https://*.vercel-insights.com https://*.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.pusher.com wss://*.pusher.com https://sockjs-*.pusher.com https://vercel.live wss://ws-us3.pusher.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default auth((req) => {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  // Protect page navigation only. API routes handle auth themselves so
  // clients get a proper 401 JSON rather than a 307 redirect to /signin.
  // Explicitly skip _next/static, _next/image, favicon.ico so cached asset
  // responses stay cacheable (a per-request nonce header would bust them).
  // Skip API routes (JSON, no CSP needed), Next internals, favicon, and
  // prefetches (cached response would bust on a per-request nonce header).
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
