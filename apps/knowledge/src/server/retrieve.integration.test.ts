import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Knowlex retrieveTopK integration test.
 *
 * Exercises the actual pgvector kNN query against a real PostgreSQL
 * instance. The test seeds deterministic 768-dim vectors directly via
 * Prisma raw SQL, mocks out the Gemini embedder so no external API key
 * is required, then calls retrieveTopK and asserts the join + distance
 * contract.
 *
 * This is the regression harness that would have caught the
 * ivfflat(lists=100) + probes=1 pathology that broke production
 * retrieval in Session 252 (see ADR-0041). With ivfflat the
 * "returns all 6 rows when k >= corpus size" assertion fails; with
 * HNSW it passes.
 *
 * Requires the compose DB to be up:
 *   docker compose up -d postgres
 *   pnpm --filter knowledge exec prisma migrate deploy
 *
 * Runs via:
 *   pnpm --filter knowledge test:integration
 *
 * Skipped by default `pnpm test` so CI runs without docker.
 */

// `vi.hoisted` is the canonical way to share a helper between the
// factory passed to `vi.mock` (which Vitest hoists above every import)
// and the rest of the test body. Without it, referencing a top-level
// function from inside the factory is brittle: Vitest's hoisting
// moves the `vi.mock` call to module top, and if the referenced
// symbol is declared lexically below it, future Vitest internals
// could trip over the temporal dead-zone. `vi.hoisted` guarantees
// the helper is available by the time the factory runs.
const { seededVector } = vi.hoisted(() => {
  /** L2-normalised deterministic 768-dim vector from a seed string. */
  function seededVector(seed: string): number[] {
    let h = 0;
    for (const c of seed) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
    const v = new Array<number>(768);
    for (let i = 0; i < 768; i++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      v[i] = ((h & 0xffff) / 0xffff) * 2 - 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map((x) => x / norm);
  }
  return { seededVector };
});

// Mock the embedder so retrieveTopK runs without hitting Gemini.
// Vitest hoists `vi.mock` above all static imports, so the real
// `@/lib/gemini` module is never loaded in this test file.
vi.mock("@/lib/gemini", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    embedTexts: async (_apiKey: string, texts: string[]) =>
      texts.map((t) => seededVector(t)),
  };
});

import { prisma } from "@/lib/db";

import { retrieveTopK } from "./retrieve";

const NUM_DOCS = 3;
const CHUNKS_PER_DOC = 2;
const TOTAL_CHUNKS = NUM_DOCS * CHUNKS_PER_DOC;

function chunkSeed(d: number, c: number) {
  return `seed_${d}_${c}`;
}

beforeAll(async () => {
  // Smoke-check the DB is reachable; skip the suite if not. We deliberately
  // don't call describe.skip conditionally — failing a SELECT 1 here gives
  // a clearer error than 12 failed assertions.
  await prisma.$queryRawUnsafe(`SELECT 1`);

  await prisma.$executeRawUnsafe(`DELETE FROM "Embedding"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Chunk"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Document"`);
  // ADR-0047 v0.5.0: ensure the default workspace exists so test
  // documents can satisfy the new NOT-NULL workspaceId constraint.
  await prisma.workspace.upsert({
    where: { id: "wks_default_v050" },
    create: {
      id: "wks_default_v050",
      name: "Default workspace",
      slug: "default",
    },
    update: {},
  });

  for (let d = 0; d < NUM_DOCS; d++) {
    const docId = `testdoc_${d}`;
    await prisma.document.create({
      data: {
        id: docId,
        workspaceId: "wks_default_v050",
        title: `Test doc ${d}`,
        content: `Doc ${d} full body`,
        charCount: 100,
      },
    });
    for (let c = 0; c < CHUNKS_PER_DOC; c++) {
      const chunkId = `testchunk_${d}_${c}`;
      await prisma.chunk.create({
        data: {
          id: chunkId,
          documentId: docId,
          ordinal: c,
          content: `Doc ${d} chunk ${c}`,
          tokenCount: 10,
        },
      });
      const vec = seededVector(chunkSeed(d, c));
      const vecLit = `[${vec.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Embedding" ("chunkId", "model", "dim", "embedding")
         VALUES ($1, 'integration-test', 768, $2::vector)`,
        chunkId,
        vecLit,
      );
    }
  }
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "Embedding"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Chunk"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Document"`);
  await prisma.$disconnect();
});

describe("retrieveTopK (real pgvector)", () => {
  it("returns up to K chunks with the join fully populated", async () => {
    const hits = await retrieveTopK({
      apiKey: "mocked",
      question: "arbitrary question",
      k: 3,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(3);
    for (const h of hits) {
      expect(h).toMatchObject({
        chunkId: expect.stringMatching(/^testchunk_/),
        documentId: expect.stringMatching(/^testdoc_/),
        documentTitle: expect.stringMatching(/^Test doc /),
        content: expect.any(String),
      });
      expect(Number.isFinite(h.distance)).toBe(true);
      expect(h.distance).toBeGreaterThanOrEqual(0);
    }
  });

  // The exact regression from Session 252: ivfflat(lists=100) with
  // probes=1 returned 0 rows even though the corpus was tiny. HNSW
  // (ADR-0041) has no probe cutoff and returns all rows here.
  it("returns every seeded row when k >= corpus size", async () => {
    const hits = await retrieveTopK({
      apiKey: "mocked",
      question: "anything",
      k: 16,
    });
    expect(hits.length).toBe(TOTAL_CHUNKS);
  });

  it("ranks the exact-seed match first with distance ≈ 0", async () => {
    // Embed the same seed string used when we stored testchunk_1_0.
    const hits = await retrieveTopK({
      apiKey: "mocked",
      question: chunkSeed(1, 0),
      k: 1,
    });
    expect(hits[0].chunkId).toBe("testchunk_1_0");
    // Cosine distance between identical unit vectors is ~0 (float noise).
    expect(hits[0].distance).toBeLessThan(1e-4);
  });
});
