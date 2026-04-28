import NextAuth from "next-auth";
import { authConfig } from "./config";

/**
 * Knowlex Auth.js v5 entrypoint. Mirrors apps/collab's `src/auth/index.ts`
 * shape so callsites read identically across the two apps:
 *
 *   import { auth } from "@/auth";
 *   const session = await auth();
 *
 * `signIn` / `signOut` are exported for the future authed UI (signin
 * button on `/`, sign-out menu); they are not yet wired into a UI
 * component but are present so the contract surface is complete.
 *
 * Per ADR-0061: the Knowlex auth flow uses JWT sessions for the same
 * Edge-Runtime-compatibility reason as apps/collab (ADR-0003 supersede
 * note). The `adapter` from PrismaAdapter is still used for the OAuth
 * account-linking flow at provider callback time — JWT is only the
 * session-cookie strategy.
 */
export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
