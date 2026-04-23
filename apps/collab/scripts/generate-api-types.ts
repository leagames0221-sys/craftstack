/**
 * Regenerate `src/openapi-types.ts` from the hand-written OpenAPI spec in
 * `src/openapi.ts`. Run via `pnpm --filter collab generate:api-types`
 * after editing the spec; the output is committed so `openapi-types.ts`
 * stays visible in code review and consumers can `import { paths } from
 * "@/openapi-types"` for full request/response inference.
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

import { openApiSpec } from "../src/openapi";

async function main() {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const ROOT = resolve(HERE, "..");

  const ast = await openapiTS(
    openApiSpec as unknown as Parameters<typeof openapiTS>[0],
  );
  const contents = astToString(ast);

  const header = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate via \`pnpm --filter collab generate:api-types\` after
 * editing \`src/openapi.ts\`. See scripts/generate-api-types.ts.
 */
`;

  const out = resolve(ROOT, "src/openapi-types.ts");
  await writeFile(out, header + contents, "utf8");

  console.log(`[generate-api-types] wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
