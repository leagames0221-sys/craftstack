import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
    // Optional: only set in CI for `prisma migrate diff --from-migrations`
    // (drift detection, ADR-0051 § Not in scope #2 → addressed in v0.5.2).
    // The `migrate diff` CLI requires a shadow DB to apply migrations
    // into, but the `--shadow-database-url` flag is not exposed on that
    // subcommand — config-side declaration is the documented path. In
    // production runtime this var is unset and ignored. In CI we point
    // at a second logical DB on the same Postgres service container.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
