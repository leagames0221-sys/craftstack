import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EXPECTED } from "./route";

/**
 * Closes the loop on the runtime schema canary.
 *
 * `EXPECTED` in `route.ts` mirrors `prisma/schema.prisma`. If the two
 * drift, the runtime canary will alarm against the wrong target list
 * and either miss real drift or false-alarm forever. This test parses
 * `schema.prisma` and asserts that, for every model in `EXPECTED`,
 * the column list matches what the schema file declares. A schema
 * change without a matching `EXPECTED` update will fail CI.
 */

const SCHEMA_PATH = resolve(__dirname, "../../../../../prisma/schema.prisma");

// Prisma scalar types Postgres maps to a column. Relation fields and
// `@@`-block annotations are excluded by parser logic below.
const SCALAR_TYPES = new Set([
  "String",
  "Int",
  "Float",
  "Boolean",
  "DateTime",
  "BigInt",
  "Decimal",
  "Bytes",
  "Json",
]);

function extractColumns(schema: string, modelName: string): string[] {
  const blockMatch = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"),
  );
  if (!blockMatch) {
    throw new Error(
      `model ${modelName} not found in schema.prisma; either add it or remove it from EXPECTED`,
    );
  }
  const body = blockMatch[1];
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("@@"));
  const cols: string[] = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const [fieldName, fieldType] = tokens;
    const baseType = fieldType.replace(/[?[\]]/g, "");
    // Scalars become columns. Unsupported(...) (e.g. pgvector
    // `vector(768)`) is a real column even though Prisma can't
    // introspect it — count it.
    if (SCALAR_TYPES.has(baseType) || fieldType.startsWith("Unsupported(")) {
      cols.push(fieldName);
    }
    // Anything else (relation field, model reference) is not a column.
  }
  return cols;
}

describe("/api/health/schema EXPECTED stays in sync with schema.prisma", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf8");

  for (const [model, expected] of Object.entries(EXPECTED)) {
    it(`model ${model} columns match schema.prisma`, () => {
      const fromSchema = extractColumns(schema, model);
      expect(fromSchema).toEqual(expected);
    });
  }

  it("EXPECTED covers every Document model in schema.prisma", () => {
    // Catch the reverse case: a new model was added to schema.prisma
    // but never registered in EXPECTED, so the canary would silently
    // miss it.
    const declaredModels = Array.from(
      schema.matchAll(/^model\s+(\w+)\s*\{/gm),
    ).map((m) => m[1]);
    const expectedModels = Object.keys(EXPECTED);
    for (const m of declaredModels) {
      expect(expectedModels).toContain(m);
    }
  });
});
