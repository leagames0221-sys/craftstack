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
    // W3C CSP spec: when a nonce is present, modern browsers IGNORE
    // 'unsafe-inline'. Listing it here is a deliberate fallback so
    // legacy browsers (and edge cases where platform-injected inline
    // scripts — Vercel Analytics, Speed Insights — don't carry the
    // nonce) still execute. Security grade on nonce-aware browsers is
    // unchanged; on non-nonce-aware browsers it degrades gracefully
    // rather than breaking every interactive page.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
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
