import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runtime schema canary — closes the runtime side of ADR-0051.
 *
 * ADR-0051 ships drift-detect-v2 as a PR-time `pg_catalog` assertion
 * (knowlex integration job in `ci.yml`). That gate prevents *future*
 * drift from landing on `main`, but it cannot detect when a Vercel
 * deploy lags behind the migrations on `main` — which is the exact
 * condition that produced the 2026-04-27 06:35 UTC eval crash where
 * `Document.workspaceId does not exist` recurred even though
 * ADR-0051's structural ratchet was already shipped.
 *
 * This endpoint compares the live Knowlex db's `information_schema`
 * against the columns expected by `prisma/schema.prisma` (mirrored in
 * the `EXPECTED` constant below; a Vitest test asserts the constant
 * stays in sync with the schema file). Any missing column flips the
 * response to HTTP 503 with a structured `{ drift: true, checks: ... }`
 * payload that names the offending table + column. Extra columns are
 * non-fatal (additive migrations are normal during expand-contract).
 *
 * Wired into `smoke.yml` so a drift on the live deploy trips the
 * 6-hourly cron, surfacing the gap *before* user-facing routes
 * (which the eval cron's nightly run also catches, but ~12-18h later).
 *
 * Recorded in ADR-0053. T-05 in `docs/security/threat-model.md`.
 */

// SOURCE OF TRUTH: `apps/knowledge/prisma/schema.prisma`. If you edit
// the schema, update this constant — `expected.test.ts` parses
// schema.prisma and asserts the two stay in sync, so a divergence
// fails CI before it can reach prod.
export const EXPECTED = {
  Workspace: ["id", "name", "slug", "createdAt"],
  Document: [
    "id",
    "workspaceId",
    "title",
    "content",
    "charCount",
    "createdAt",
    "updatedAt",
  ],
  Chunk: [
    "id",
    "documentId",
    "ordinal",
    "content",
    "tokenCount",
    "createdAt",
    // ADR-0063 hybrid retrieval — generated tsvector column maintained
    // by Postgres on insert/update via the 20260428_chunk_fts migration.
    // The schema canary asserts the column exists post-deploy so a
    // stale Vercel build that didn't run the migration trips the
    // 6-hourly smoke (axis 2 of ADR-0057).
    "tsv",
  ],
  Embedding: ["chunkId", "model", "dim", "embedding", "createdAt"],
  // Auth.js v5 tables shipped in v0.5.12 (ADR-0061). Closes the
  // access-control half of ADR-0047 § Status. Each row mirrors the
  // schema.prisma model 1:1 — the expected.test.ts cross-checks both
  // directions so a column add/drop without an EXPECTED update fails
  // CI immediately.
  User: [
    "id",
    "email",
    "emailVerified",
    "name",
    "image",
    "createdAt",
    "updatedAt",
  ],
  Account: [
    "id",
    "userId",
    "type",
    "provider",
    "providerAccountId",
    "refresh_token",
    "access_token",
    "expires_at",
    "token_type",
    "scope",
    "id_token",
    "session_state",
  ],
  Session: ["id", "sessionToken", "userId", "expires"],
  VerificationToken: ["identifier", "token", "expires"],
  Membership: ["id", "userId", "workspaceId", "role", "joinedAt"],
} as const;

type SchemaCheck = {
  table: string;
  expected: string[];
  actual: string[];
  missing: string[];
  extra: string[];
  drift: boolean;
};

type LatestMigration = {
  name: string;
  appliedAt: string;
} | null;

type SchemaPayload = {
  drift: boolean;
  latestMigration: LatestMigration;
  checks: SchemaCheck[];
};

export async function GET() {
  const tables = Object.keys(EXPECTED);

  const actualRows = await prisma.$queryRawUnsafe<
    Array<{ table_name: string; column_name: string }>
  >(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    tables,
  );

  const actualByTable = new Map<string, string[]>();
  for (const r of actualRows) {
    if (!actualByTable.has(r.table_name)) {
      actualByTable.set(r.table_name, []);
    }
    actualByTable.get(r.table_name)!.push(r.column_name);
  }

  const checks: SchemaCheck[] = [];
  let anyDrift = false;
  for (const [table, expected] of Object.entries(EXPECTED)) {
    const actual = actualByTable.get(table) ?? [];
    const missing = (expected as readonly string[]).filter(
      (c) => !actual.includes(c),
    );
    // Extra columns are non-fatal: additive migrations are normal
    // during the expand phase of expand-backfill-contract.
    const extra = actual.filter(
      (c) => !(expected as readonly string[]).includes(c),
    );
    const drift = missing.length > 0;
    if (drift) {
      anyDrift = true;
    }
    checks.push({
      table,
      expected: [...(expected as readonly string[])],
      actual,
      missing,
      extra,
      drift,
    });
  }

  // _prisma_migrations is the runtime witness for which migration the
  // live db actually has. Surface it so an operator triaging a drift
  // alert can see exactly which migration is missing without ssh-ing
  // to a Vercel runtime.
  let latestMigration: LatestMigration = null;
  try {
    const migRows = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: Date | null }>
    >(
      `SELECT migration_name, finished_at FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 1`,
    );
    if (migRows[0] && migRows[0].finished_at) {
      latestMigration = {
        name: migRows[0].migration_name,
        appliedAt: migRows[0].finished_at.toISOString(),
      };
    }
  } catch {
    // `_prisma_migrations` may be absent in some test/dev contexts.
    // Schema canary still works for the column-level diff; migration
    // metadata is best-effort.
  }

  const payload: SchemaPayload = {
    drift: anyDrift,
    latestMigration,
    checks,
  };

  return NextResponse.json(payload, {
    status: anyDrift ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
