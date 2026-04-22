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
    authorized: async ({ auth }) => !!auth?.user,
    session: async ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
