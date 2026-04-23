import { PrismaPg } from "@prisma/adapter-pg";
// Import the Knowlex-specific generated client. Output path is set in
// prisma/schema.prisma via `generator client { output = ... }` so this
// app's client doesn't collide with apps/collab's in the monorepo
// (both would otherwise share `@prisma/client` via pnpm dedup and the
// last `prisma generate` would clobber the first).
import { PrismaClient } from "../../node_modules/.prisma-knowlex/client";

/**
 * Knowlex Prisma client. Same adapter pattern as Boardly (ADR-0002).
 *
 * The MVP is tenantless per ADR-0039 — the `withTenant` helper is
 * preserved for the eventual tenanted schema bring-back (ADR-0010 is
 * the target) but the MVP path doesn't invoke it.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrisma(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://app:app@localhost:5432/knowlex";
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
