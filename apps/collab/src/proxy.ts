/**
 * Next.js 16 renamed `middleware` to `proxy`.
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Job: delegate to Auth.js so unauthenticated users on protected routes
 * are redirected to `/signin`.
 *
 * CSP note: we previously injected a per-request nonce-based CSP from
 * this proxy (nonce + `'strict-dynamic'`) to reach A+ on
 * securityheaders.com. On Vercel that interacted badly with platform-
 * injected scripts (Speed Insights, preview toolbar, some Next chunks)
 * that don't carry our nonce, and hydration silently failed — every
 * interactive page looked dead. Rolled back to the static CSP in
 * `next.config.ts`. Grade drops from A+ to A; functional site wins.
 * Decision recorded in ADR-0040.
 */
import NextAuth from "next-auth";
import { authEdgeConfig } from "@/auth/config.edge";

const { auth } = NextAuth(authEdgeConfig);

export default auth;

export const config = {
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
