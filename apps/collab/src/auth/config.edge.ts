import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config.
 * The proxy (src/proxy.ts) runs on the Vercel Edge Runtime, which does not
 * support the Prisma node-postgres adapter. This config omits the adapter
 * so the proxy can still evaluate `authorized` against the JWT session
 * cookie without touching the database. The full config with PrismaAdapter
 * lives in ./config.ts and is used by /api/auth/[...nextauth] on the Node
 * runtime. Both sides must share the same AUTH_SECRET for JWT signature
 * verification.
 */
export const authEdgeConfig = {
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: { signIn: "/signin" },
  callbacks: {
    authorized: async ({ auth, request }) => {
      const { pathname } = request.nextUrl;
      // Unauthenticated pages that still flow through the proxy so they
      // get the nonce-based CSP header. Returning true here short-circuits
      // the auth gate without changing page-level RBAC.
      if (pathname === "/") return true;
      if (pathname.startsWith("/signin")) return true;
      if (pathname.startsWith("/invite")) return true;
      // Public playground demo for recruiters; no auth required.
      if (pathname.startsWith("/playground")) return true;
      // Public API reference.
      if (pathname.startsWith("/docs")) return true;
      // Public integration-health board.
      if (pathname.startsWith("/status")) return true;
      return !!auth?.user;
    },
    session: async ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
