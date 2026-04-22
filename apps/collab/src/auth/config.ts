import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

/**
 * Auth.js v5 configuration (ADR-0003).
 *
 * - Strategy: `database` sessions so server-side revocation is immediate
 *   (important for invitation/RBAC flows)
 * - Adapter: Prisma (User / Account / Session / VerificationToken)
 * - Providers: Google + GitHub OAuth
 *
 * For E2E tests the `credentials` provider is added conditionally in
 * `auth.test.ts` (ADR-0022) so OAuth redirects do not have to be mocked.
 */
export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
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
    session: async ({ session, user }) => {
      // expose internal user id to the app surface
      session.user.id = user.id;
      return session;
    },
  },
} satisfies NextAuthConfig;
