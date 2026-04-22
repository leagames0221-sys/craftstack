import "dotenv/config";
import { defineConfig } from "prisma/config";

// Note: Prisma 7 config API.
//   - `datasource.url` = connection used by `prisma migrate` / `prisma db push`.
//   - At runtime, PrismaClient may be constructed with a dedicated app-role
//     connection via `driver adapters` (added later when RLS lands).
//   - Locally both migrator and app run against DATABASE_URL for simplicity.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
