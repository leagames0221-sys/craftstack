/**
 * Knowlex retrieveTopK latency bench.
 *
 * Seeds N random 768-dim vectors against the Knowlex schema and runs M
 * kNN queries, reporting min / p50 / p95 / p99 / max wall-clock time in
 * milliseconds. Intended as a lightweight regression check on index
 * tuning — the HNSW swap in ADR-0041 is the baseline; any future move
 * (ivfflat with proper lists, bigger `m`, tuned `ef_search`) can be
 * compared numerically rather than by feel.
 *
 * Usage (docker-compose knowlex DB up, migrations applied):
 *
 *   pnpm --filter knowledge bench           # N=1000, M=100 (default)
 *   BENCH_N=5000 BENCH_M=200 pnpm --filter knowledge bench
 *
 * The bench leaves the seeded rows behind so repeated runs stay warm;
 * pass BENCH_CLEAN=1 to delete them on exit.
 */

import { performance } from "node:perf_hooks";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../node_modules/.prisma-knowlex/client";

const N = Number(process.env.BENCH_N ?? 1000);
const M = Number(process.env.BENCH_M ?? 100);
const K = Number(process.env.BENCH_K ?? 6);
const DIM = 768;
const CLEAN = process.env.BENCH_CLEAN === "1";

function rand768(): number[] {
  const v = new Array<number>(DIM);
  for (let i = 0; i < DIM; i++) v[i] = Math.random() * 2 - 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://app:app@localhost:5432/knowlex?schema=public";
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["error"],
  });

  console.log(
    `[bench] connecting: ${connectionString.replace(/:[^@/]+@/, ":***@")}`,
  );
  console.log(`[bench] N=${N} seed rows, M=${M} queries, K=${K}`);

  // Ensure at least N seed rows under a dedicated document.
  // ADR-0047 v0.5.0: bench-only path uses the default workspace
  // seeded by the v0.5.0 migration. The bench is a local-dev tool
  // and never runs against production.
  const seedDocId = "bench_seed_doc";
  await prisma.workspace.upsert({
    where: { id: "wks_default_v050" },
    create: {
      id: "wks_default_v050",
      name: "Default workspace",
      slug: "default",
    },
    update: {},
  });
  await prisma.document.upsert({
    where: { id: seedDocId },
    create: {
      id: seedDocId,
      workspaceId: "wks_default_v050",
      title: "bench seed",
      content: "bench",
      charCount: 5,
    },
    update: {},
  });

  const existing = await prisma.chunk.count({
    where: { documentId: seedDocId },
  });
  const needed = Math.max(0, N - existing);
  if (needed > 0) {
    console.log(`[bench] seeding ${needed} new rows (existing=${existing})`);
    const t0 = performance.now();
    for (let i = existing; i < N; i++) {
      const chunkId = `bench_chunk_${i}`;
      await prisma.chunk.upsert({
        where: { id: chunkId },
        create: {
          id: chunkId,
          documentId: seedDocId,
          ordinal: i,
          content: `bench ${i}`,
          tokenCount: 2,
        },
        update: {},
      });
      const vec = `[${rand768().join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Embedding" ("chunkId","model","dim","embedding")
           VALUES ($1,'bench',768,$2::vector)
         ON CONFLICT ("chunkId") DO UPDATE SET "embedding" = EXCLUDED."embedding"`,
        chunkId,
        vec,
      );
    }
    console.log(
      `[bench] seed done in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
  } else {
    console.log(`[bench] reusing ${existing} existing rows`);
  }

  // Run M kNN queries with different random probe vectors.
  const durations: number[] = [];
  for (let i = 0; i < M; i++) {
    const probe = `[${rand768().join(",")}]`;
    const t0 = performance.now();
    await prisma.$queryRawUnsafe(
      `SELECT e."chunkId", (e."embedding" <=> $1::vector) AS distance
         FROM "Embedding" e
         JOIN "Chunk"    c ON c."id" = e."chunkId"
         JOIN "Document" d ON d."id" = c."documentId"
        ORDER BY e."embedding" <=> $1::vector
        LIMIT $2`,
      probe,
      K,
    );
    durations.push(performance.now() - t0);
  }

  durations.sort((a, b) => a - b);
  const fmt = (ms: number) => `${ms.toFixed(2)} ms`;
  console.log("[bench] latency:");
  console.log(`  min  = ${fmt(durations[0])}`);
  console.log(`  p50  = ${fmt(percentile(durations, 50))}`);
  console.log(`  p95  = ${fmt(percentile(durations, 95))}`);
  console.log(`  p99  = ${fmt(percentile(durations, 99))}`);
  console.log(`  max  = ${fmt(durations[durations.length - 1])}`);

  if (CLEAN) {
    console.log("[bench] cleaning seed rows (BENCH_CLEAN=1)");
    await prisma.document.delete({ where: { id: seedDocId } });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
