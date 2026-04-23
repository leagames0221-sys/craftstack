import path from "node:path";
import { defineConfig } from "vitest/config";

// `pnpm test` runs the unit suite only. Integration tests live in
// `*.integration.test.ts` and need a real pgvector instance
// (docker-compose); they are opt-in via `pnpm test:integration`.
const integration = process.env.KNOWLEX_INTEGRATION === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: integration
      ? ["src/**/*.integration.test.ts"]
      : ["src/**/*.{test,spec}.ts"],
    exclude: integration ? [] : ["**/*.integration.test.ts"],
    // Integration tests serialize on a shared DB; don't parallelise.
    fileParallelism: !integration,
  },
});
