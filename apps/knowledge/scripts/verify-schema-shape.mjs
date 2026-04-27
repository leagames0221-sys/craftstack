#!/usr/bin/env node
/**
 * Drift detection v2 — pg_catalog assertion script (ADR-0051 § Drift
 * detection deferred → option 2).
 *
 * After `prisma migrate deploy` runs in the knowlex-integration CI job,
 * this script connects to the same DB and asserts a known-good
 * structural shape: tables, columns, indexes (including HNSW which
 * Prisma's declarative schema language cannot represent and which
 * therefore made `prisma migrate diff --from-migrations --to-schema`
 * unusable as a drift gate — see ADR-0051 § Drift detection deferred).
 *
 * Why pg_catalog and not `prisma db pull`:
 * - `prisma db pull` produces output gated by what schema.prisma can
 *   express. HNSW indexes and `USING vector` parameters fall outside
 *   that vocabulary, so a snapshot would either silently omit them or
 *   embed them as comments — fragile to diff.
 * - pg_catalog tables (information_schema.columns, pg_index, pg_am)
 *   give the actual physical state of the DB. Asserting against a
 *   curated expected-shape JSON is robust to Prisma's representation
 *   gaps and explicit about what we care about.
 *
 * Exit codes:
 *   0 — DB shape matches the expected manifest
 *   2 — drift detected (one or more expected tables/columns/indexes missing)
 *   1 — connection or query error
 *
 * Usage (from CI, after migrate deploy):
 *   DATABASE_URL=postgresql://... node scripts/verify-schema-shape.mjs
 *
 * Updating the expected shape:
 *   When a future migration adds a table/column/index, hand-edit
 *   `apps/knowledge/prisma/expected-shape.json` in the same PR. The
 *   schema and the manifest move together; this script is the gate
 *   that ensures they don't drift.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const hereDir = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(hereDir, "../prisma/expected-shape.json");

function readManifest() {
  const body = readFileSync(manifestPath, "utf8");
  return JSON.parse(body);
}

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[verify-schema] DATABASE_URL env var is not set");
    process.exit(1);
  }
  return url;
}

async function main() {
  const expected = readManifest();
  const url = getDatabaseUrl();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const failures = [];

    // ---- Tables ----
    // information_schema.tables is the canonical source for "does this
    // table exist". We restrict to schema='public' because all Knowlex
    // tables live there; Postgres system schemas are intentionally
    // excluded.
    const tableRows = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tableSet = new Set(tableRows.rows.map((r) => r.table_name));
    for (const t of expected.tables ?? []) {
      if (!tableSet.has(t)) failures.push(`missing table: ${t}`);
    }

    // ---- Columns ----
    // Per-table column presence. Type checks are deliberately omitted —
    // type drift surfaces at runtime via Prisma client mismatch, and
    // the v0.5.0 incident class was specifically a missing-column case
    // (workspaceId), not a type-changed one. Adding type checks later
    // is additive.
    for (const [tableName, expectedCols] of Object.entries(
      expected.columns ?? {},
    )) {
      const colRows = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [tableName],
      );
      const colSet = new Set(colRows.rows.map((r) => r.column_name));
      for (const c of expectedCols) {
        if (!colSet.has(c))
          failures.push(`missing column: ${tableName}.${c}`);
      }
    }

    // ---- Indexes ----
    // pg_index + pg_class gives index name; pg_am.amname gives the
    // access-method (btree / gin / hnsw / ...) which is the dimension
    // Prisma cannot express in schema.prisma for the HNSW case. The
    // expected manifest declares both name AND amname, so v0.4.x's
    // `Embedding_embedding_cosine_idx` USING hnsw is asserted here even
    // though no Prisma file expresses "hnsw" as a token.
    const idxRows = await client.query(
      `SELECT c.relname AS idx_name, am.amname AS access_method
         FROM pg_class c
         JOIN pg_index i  ON i.indexrelid = c.oid
         JOIN pg_am    am ON am.oid = c.relam
        WHERE c.relkind = 'i'
          AND c.relname NOT LIKE 'pg_%'`,
    );
    const idxByName = new Map();
    for (const r of idxRows.rows) idxByName.set(r.idx_name, r.access_method);
    for (const idx of expected.indexes ?? []) {
      const name = typeof idx === "string" ? idx : idx.name;
      const expectedAm = typeof idx === "string" ? null : idx.accessMethod;
      const actualAm = idxByName.get(name);
      if (!actualAm) {
        failures.push(`missing index: ${name}`);
      } else if (expectedAm && actualAm !== expectedAm) {
        failures.push(
          `index ${name} access method mismatch: expected ${expectedAm}, got ${actualAm}`,
        );
      }
    }

    // ---- Extensions ----
    // pg_extension. Only assert presence; version pinning is out of
    // scope (Neon may auto-update extensions).
    if ((expected.extensions ?? []).length > 0) {
      const extRows = await client.query(
        `SELECT extname FROM pg_extension`,
      );
      const extSet = new Set(extRows.rows.map((r) => r.extname));
      for (const e of expected.extensions) {
        if (!extSet.has(e)) failures.push(`missing extension: ${e}`);
      }
    }

    if (failures.length > 0) {
      console.error("[verify-schema] DRIFT DETECTED:");
      for (const f of failures) console.error(`  - ${f}`);
      console.error(
        `\n[verify-schema] ${failures.length} structural mismatch(es) — update prisma/expected-shape.json IFF the change is intentional, otherwise add the missing migration.`,
      );
      process.exit(2);
    }

    console.log(
      `[verify-schema] OK — ${expected.tables?.length ?? 0} tables, ${
        Object.keys(expected.columns ?? {}).length
      } column groups, ${expected.indexes?.length ?? 0} indexes, ${
        expected.extensions?.length ?? 0
      } extensions verified.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[verify-schema] error:", err);
  process.exit(1);
});
