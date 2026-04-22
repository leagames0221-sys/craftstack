import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Knowlex Prisma client. Same adapter pattern as Boardly (ADR-0002).
 * Tenant isolation happens via `withTenant(tenantId, fn)` which issues
 * `SET LOCAL app.tenant_id` inside a transaction so RLS policies activate
 * on every query. See ADR-0010.
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

/**
 * Every tenant-scoped handler must wrap its Prisma calls in this helper.
 * Running plain `prisma.document.findMany()` without it returns 0 rows
 * because the RLS policy predicates evaluate against the unset GUC.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Parameter binding is not supported for `SET LOCAL`, so validate the
    // tenant id strictly before interpolating. cuid() is [a-z0-9]{24+}.
    if (!/^[a-z0-9]+$/i.test(tenantId)) {
      throw new Error("invalid tenantId for withTenant");
    }
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx as unknown as PrismaClient);
  });
}
