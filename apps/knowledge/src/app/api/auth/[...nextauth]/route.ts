import { handlers } from "@/auth";

/**
 * Auth.js v5 catch-all route handler for Knowlex.
 *
 * Routes mounted here:
 *   GET  /api/auth/signin           — provider list
 *   POST /api/auth/signin/<provider> — initiate OAuth
 *   GET  /api/auth/callback/<provider> — OAuth callback
 *   POST /api/auth/signout
 *   GET  /api/auth/session
 *   GET  /api/auth/csrf
 *
 * Recorded in ADR-0061.
 */
export const { GET, POST } = handlers;
