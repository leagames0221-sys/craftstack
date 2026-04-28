import { PrismaAdapter } from "@auth/prisma-adapter";
import { timingSafeEqual } from "node:crypto";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
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
 * lives in the per-app Neon database (ADR-0018).
 *
 * Recorded in ADR-0061 (initial OAuth + tenancy shape). The CI-only
 * Credentials provider was named in ADR-0061 line 52 as a deferred
 * follow-up; ADR-0064 surfaced calibration as the trigger; ADR-0065
 * (this implementation) closes the gap by mirroring the apps/collab
 * triple-gate pattern from ADR-0038.
 */

/**
 * E2E-only credentials provider (ADR-0065, mirrors apps/collab ADR-0038).
 *
 * Registered ONLY when the triple gate is green:
 *   - VERCEL env var is NOT "1" (mechanically excludes Vercel-hosted
 *     deploys regardless of NODE_ENV; Vercel always sets VERCEL=1)
 *   - E2E_ENABLED === "1" (off by default)
 *   - E2E_SHARED_SECRET is set and >= 16 bytes
 *
 * Even with all three, a valid signin requires a `secret` field matching
 * E2E_SHARED_SECRET via constant-time compare AND the email must be in
 * the short hard-coded allowlist.
 *
 * Knowlex-specific delta from apps/collab: the E2E user is auto-upserted
 * on first authorize() call rather than seeded at startup. Knowlex has
 * no prisma seed.ts (ADR-0061 single-tenant + demo-allowlist pattern),
 * so adding one purely for the E2E user would be over-scope. The
 * upsert is gated by the same triple-gate so it cannot fire on prod.
 */
export const ALLOWED_E2E_EMAILS = new Set([
  "e2e+owner@e2e.example",
  "e2e+editor@e2e.example",
  "e2e+viewer@e2e.example",
]);

/**
 * Pure gate predicate — exported for Vitest. Returns true ONLY when all
 * three conditions hold (no Vercel, E2E enabled, secret >= 16 bytes).
 * The provider registration calls this; on prod it returns false
 * regardless of any other env state.
 */
export function e2eGateOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL === "1") return false;
  if (env.E2E_ENABLED !== "1") return false;
  const expected = env.E2E_SHARED_SECRET;
  if (!expected || expected.length < 16) return false;
  return true;
}

function maybeCredentialsProvider() {
  if (!e2eGateOpen()) return null;
  const expected = process.env.E2E_SHARED_SECRET as string;
  const expectedBytes = Buffer.from(expected);

  console.warn(
    "[auth] Knowlex E2E credentials provider REGISTERED — VERCEL=%s E2E_ENABLED=%s. This should only happen in CI/test/calibration runs.",
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
      // Auto-upsert: the user row exists if a previous E2E run already
      // created it, otherwise create it now. Idempotent. Triple-gated
      // upstream so this code path is structurally unreachable on prod.
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name:
            email === "e2e+owner@e2e.example"
              ? "E2E Owner"
              : email === "e2e+editor@e2e.example"
                ? "E2E Editor"
                : "E2E Viewer",
        },
      });
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
    ...(e2eProvider ? [e2eProvider] : []),
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
