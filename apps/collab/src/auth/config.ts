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
 * Registered ONLY when the triple gate is green:
 *   - E2E_ENABLED === "1"
 *   - E2E_SHARED_SECRET is set and >= 16 bytes
 *   - VERCEL env var is NOT set (mechanically excludes Vercel-hosted
 *     deploys regardless of NODE_ENV; Vercel always sets VERCEL=1)
 *
 * Even with all three, a valid signin requires a `secret` field matching
 * E2E_SHARED_SECRET via constant-time compare, AND the email must be in
 * a short allowlist. This makes the provider a surgical tool for the
 * Playwright CI suite and mechanically inert on prod.
 *
 * Note: `next build` sets NODE_ENV=production for the optimized output,
 * and `next start` preserves it — so a NODE_ENV-based gate would break
 * CI. We use the Vercel-env heuristic instead, which is set by the
 * hosting platform, not by the build step.
 */
const ALLOWED_E2E_EMAILS = new Set([
  "e2e+owner@e2e.example",
  "e2e+editor@e2e.example",
  "e2e+viewer@e2e.example",
]);

function maybeCredentialsProvider() {
  if (process.env.VERCEL === "1") return null;
  if (process.env.E2E_ENABLED !== "1") return null;
  const expected = process.env.E2E_SHARED_SECRET;
  if (!expected || expected.length < 16) return null;
  const expectedBytes = Buffer.from(expected);

  // eslint-disable-next-line no-console
  console.warn(
    "[auth] E2E credentials provider REGISTERED — VERCEL=%s E2E_ENABLED=%s. This should only happen in CI/test runs.",
    process.env.VERCEL ?? "<unset>",
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
