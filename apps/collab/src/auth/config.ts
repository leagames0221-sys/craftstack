import { PrismaAdapter } from "@auth/prisma-adapter";
import { timingSafeEqual } from "node:crypto";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
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
 * - Providers: Google + GitHub OAuth + (CI-only) Credentials.
 */

/**
 * E2E-only credentials provider (ADR-0022, implementation ADR-0038).
 *
 * Registered ONLY when BOTH gates are green:
 *   - NODE_ENV !== "production"
 *   - E2E_ENABLED === "1"
 *
 * Even with both set, a valid signin requires a `secret` field matching
 * E2E_SHARED_SECRET via constant-time compare, AND the email must be in
 * a short allowlist. This makes the provider a surgical tool for the
 * Playwright CI suite and mechanically inert everywhere else.
 */
const ALLOWED_E2E_EMAILS = new Set([
  "e2e+owner@e2e.example",
  "e2e+editor@e2e.example",
  "e2e+viewer@e2e.example",
]);

function maybeCredentialsProvider() {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.E2E_ENABLED !== "1") return null;
  const expected = process.env.E2E_SHARED_SECRET;
  if (!expected || expected.length < 16) return null;
  const expectedBytes = Buffer.from(expected);

  // eslint-disable-next-line no-console
  console.warn(
    "[auth] E2E credentials provider REGISTERED — NODE_ENV=%s E2E_ENABLED=%s. This should only happen in CI/test runs.",
    process.env.NODE_ENV,
    process.env.E2E_ENABLED,
  );

  return Credentials({
    id: "e2e",
    name: "E2E",
    credentials: {
      email: { label: "Email", type: "email" },
      secret: { label: "Secret", type: "password" },
    },
    authorize: async (raw) => {
      const email =
        typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
      const secret = typeof raw?.secret === "string" ? raw.secret : "";
      if (!email || !secret) return null;
      if (!ALLOWED_E2E_EMAILS.has(email)) return null;
      const got = Buffer.from(secret);
      if (got.length !== expectedBytes.length) return null;
      if (!timingSafeEqual(got, expectedBytes)) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  });
}

const e2eProvider = maybeCredentialsProvider();

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
    ...(e2eProvider ? [e2eProvider] : []),
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
