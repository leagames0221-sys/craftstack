import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

/**
 * Prisma 7 requires a driver adapter or Accelerate URL at client construction.
 * We use `@prisma/adapter-pg` so:
 *   - local dev and CI hit Neon / local Postgres via the node-postgres driver
 *   - production can swap to Neon's HTTP driver later (same adapter interface)
 *
 * Globally cached so Next.js HMR doesn't spawn a new pool on every reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrisma(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/boardly'
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
