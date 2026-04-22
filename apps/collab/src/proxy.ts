/**
 * Next.js 16 renamed `middleware` to `proxy`.
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Delegates to Auth.js so unauthenticated users on protected routes
 * are redirected to `/signin`.
 */
import NextAuth from "next-auth";
import { authEdgeConfig } from "@/auth/config.edge";

const { auth } = NextAuth(authEdgeConfig);

export default auth;

export const config = {
  // Protect page navigation only. API routes handle auth themselves so
  // clients get a proper 401 JSON rather than a 307 redirect to /signin.
  matcher: ["/((?!signin|api|_next/static|_next/image|favicon.ico).*)"],
};
