import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
// Cast to `any` for the adapter — the Knowlex Prisma client is generated
// to a custom output path (`node_modules/.prisma-knowlex/client`), so its
// runtime types don't structurally match the @auth/prisma-adapter's
// `PrismaClient` shape signature even though the methods needed by the
// adapter (user, account, session, verificationToken) are all present.
// Same pragmatic pattern as apps/collab — see ADR-0061 § Implementation
// notes for the full reasoning. The adapter only invokes a fixed set of
// model methods and our schema mirrors the Auth.js v5 contract verbatim
// (User / Account / Session / VerificationToken with the Auth.js field
// names), so the cast is safe in practice.
import { prisma } from "@/lib/db";

/**
 * Auth.js v5 configuration for Knowlex.
 *
 * Mirrors apps/collab's setup so the two apps share OAuth provider
 * registration patterns. Per-app data (User / Account / Membership)
 * lives in the per-app Neon database (ADR-0018). The CI-only
 * Credentials provider is intentionally NOT replicated here yet — the
 * Knowlex E2E surface is still public-demo + smoke; if and when an
 * authed Playwright E2E lands on Knowlex, the credentials provider
 * pattern from apps/collab's auth/config.ts can be copied across the
 * same triple-gate (VERCEL!=1 + E2E_ENABLED=1 + E2E_SHARED_SECRET).
 *
 * Recorded in ADR-0061. Closes the access-control half of ADR-0047.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = PrismaAdapter(prisma as any);

export const authConfig = {
  adapter,
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
      if (user) token.sub = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
