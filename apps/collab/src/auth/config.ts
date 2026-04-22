import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

/**
 * Auth.js v5 configuration.
 *
 * - Strategy: `jwt` because the proxy in src/proxy.ts runs on Vercel Edge
 *   Runtime, which cannot reach the Prisma pg adapter needed by the
 *   database strategy. JWT sessions validate on the edge without a DB
 *   round trip. Revocation semantics are softer (expiry only); acceptable
 *   for this portfolio. Supersedes ADR-0003.
 * - Adapter: Prisma (User / Account / VerificationToken) — still used
 *   by the OAuth account linking flow even under JWT sessions.
 * - Providers: Google + GitHub OAuth.
 */
export const authConfig = {
  adapter: PrismaAdapter(prisma),
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
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    authorized: async ({ auth }) => !!auth?.user,
    jwt: async ({ token, user }) => {
      // `user` is populated only on sign-in; persist its id into the token.
      if (user) token.sub = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
