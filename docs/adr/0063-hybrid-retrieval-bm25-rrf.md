# ADR-0063: Hybrid retrieval — Postgres FTS + pgvector kNN fused via RRF (closes ADR-0011 deferred)

- Status: Accepted
- Date: 2026-04-28
- Tags: rag, retrieval, knowlex, hybrid, bm25, fts, rrf
- Companions: [ADR-0011](0011-hybrid-search-rerank.md) (the design-phase plan this ADR ships, status updated from Accepted-planned to Fully Accepted), [ADR-0041](0041-knowlex-ivfflat-to-hnsw.md) (pgvector HNSW index — the vector half of the hybrid), [ADR-0046](0046-zero-cost-by-construction.md) (free-tier compliance — no new search service, same Neon database), [ADR-0049](0049-rag-eval-client-retry-contract.md) § 8th arc (paraphrase fragility — hybrid retrieval is a structural complement to ADR-0062's --judge mode for the same class), [ADR-0062](0062-llm-as-judge-eval-flag.md) (the prior ratchet that closed § 8th arc Action item (2); this ratchet closes the older ADR-0011 plan)

## Context

ADR-0011 was authored at design phase as the planned hybrid retrieval shape: pgvector cosine kNN combined with BM25 lexical search via Reciprocal Rank Fusion, optionally followed by Cohere Rerank. ADR-0039 (Knowlex MVP scope) explicitly deferred all three components — pure cosine kNN was the v0.5.x baseline. ADR-0011 carried "Accepted (planned)" status with the v0.5.2 deferral note from day 1.

Three ratchets across this session graduated honest-disclose / planned items to closures (T-01 / I-01 / ADR-0049 § 8th arc). ADR-0011's planned hybrid retrieval is the **fourth graduation candidate** and the largest deferred ADR-0039 item. The ADR-0049 § 8th arc fix shipped (--judge mode) but ADR-0049 § 8th arc itself observed:

> **Why no prompt tuning now**: prompt-tuning to chase the failing substrings is the Goodhart-the-metric move ... If the cron stays at 4/30 across Run 10/11/12, that's signal the substring-OR scoring is structurally unfit for the current model and `--judge` mode is the answer — not regex-fiddling.

Hybrid retrieval is a **complementary** ratchet to --judge mode: --judge fixes the **scoring** (rubric-based faithfulness rather than substring match); hybrid retrieval fixes the **retrieval** (lexical recall surfaces chunks vector kNN missed for keyword-heavy queries). Both are needed for a RAG system that's robust across query distributions.

## Decision

Add Postgres FTS as a **second retrieval list** alongside the existing pgvector cosine kNN, fuse the two via Reciprocal Rank Fusion at the application layer. Gate behind `HYBRID_RETRIEVAL_ENABLED=1` env flag — default off — so the v0.5.13 baseline retrieval is preserved until an operator opts in and a calibration run measures the hybrid lift.

### Why Postgres FTS over external BM25

Choices considered:

- **Pure BM25 via Elasticsearch / Meilisearch / Typesense** — adds a new search service, breaks ADR-0046 free-tier-by-construction, doubles ops surface (auth, storage, backup, scaling). Rejected.
- **pgbm25 / paradedb extension** — closer to "real" BM25 ranking semantics but requires a Postgres extension Neon doesn't support. Rejected at v0.5.14; revisit if Neon adds it.
- **Postgres native `tsvector` + `ts_rank_cd`** — built into every Postgres install, GIN-indexable for sub-millisecond `@@` lookups, BM25-equivalent in spirit (proximity-aware ranking via cover-density). Adopted.

`ts_rank_cd` (cover-density rank) is used over plain `ts_rank` because cover-density rewards passages where query terms appear close together — closer to BM25's proximity component than `ts_rank`'s frequency-only ranking. `plainto_tsquery('english', $query)` is used over `to_tsquery` because user questions are natural-language sentences without Postgres-FTS-syntax obligations; plainto_tsquery handles tokenization + stop-word removal automatically.

### Why RRF over score normalization

Vector cosine distance ∈ [0, 2] (lower = better). Postgres `ts_rank_cd` is unbounded positive (higher = better). Combining the two scores into a single ranking requires either:

1. **Score normalization** — calibrate each score's distribution (e.g. min-max within the candidate pool, or learn a sigmoid mapping). Sensitive to candidate-pool boundaries, requires re-calibration on corpus changes, distorts the signal at the tails.
2. **Reciprocal Rank Fusion (RRF)** — discard scores entirely, fuse on rank. Each list contributes `weight / (k + rank)` to a unified score. Cormack et al. (2009) showed RRF outperforms or matches more complex fusion strategies on TREC retrieval benchmarks with `k = 60` as the canonical default.

RRF adopted. `RRF_K = 60` per the canonical default. The fusion module (`apps/knowledge/src/server/rrf.ts`) is small (~60 LOC), weight-aware (operator can bias one list when query class is known), and exposes per-source rank provenance (`{ vector: 1, lexical: 4 }`) so debug output / future report JSON can show why each fused chunk was surfaced.

### Schema migration (additive)

`apps/knowledge/prisma/migrations/20260428_chunk_fts/migration.sql`:

```sql
ALTER TABLE "Chunk"
  ADD COLUMN "tsv" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

CREATE INDEX "Chunk_tsv_gin_idx" ON "Chunk" USING GIN ("tsv");
```

Generated column = Postgres maintains the value on every insert/update. No app-side trigger to keep in sync. GIN index = sub-millisecond `@@` lookups. Storage cost ~150-300 bytes per 512-char chunk (token positions + index entries); negligible at portfolio-scale corpora.

The existing `Chunk` model in `schema.prisma` gains `tsv Unsupported("tsvector")?` so prisma-migrate-deploy parity is preserved. The column is queried only via raw SQL in `retrieve.ts` (Prisma's typed client doesn't model tsvector directly, which is fine — the retrieve layer is already raw-SQL by necessity for the `<=>` cosine operator).

The schema canary `EXPECTED` constant (`apps/knowledge/src/app/api/health/schema/route.ts`) gains the `tsv` column — a stale Vercel build that didn't run the migration trips the 6-hourly smoke (axis 2 of ADR-0057).

### Wiring

`apps/knowledge/src/server/retrieve.ts`:

- New helpers: `retrieveVector` (extracted from inline kNN SQL, no behavior change), `retrieveLexical` (Postgres FTS `@@ plainto_tsquery` + `ts_rank_cd`).
- Hybrid path (when `HYBRID_RETRIEVAL_ENABLED=1`):
  - Both lists return up to `HYBRID_CANDIDATE_MULTIPLIER * k` candidates (default 2K) so documents that one list ranks low + the other ranks high don't fall off the candidate pool before fusion.
  - `fuseRRF` combines the two ranked lists.
  - Fused top-K results are materialised back from the union of returned rows; vector row is preferred (carries the meaningful cosine distance) with lexical row as fallback for chunks surfaced only by FTS.
- Output shape (`RetrievedChunk`) gains optional `hybridSources` field — `Record<list-name, rank>` — for provenance. Absent when hybrid is off, present when on.

### Default-off discipline

The `HYBRID_RETRIEVAL_ENABLED` env flag defaults off. Why:

- **Run-to-run comparability**: the nightly eval cron compares this run's pass-rate / p95-latency against historical runs. A silent flip from pure-cosine to hybrid would invalidate the comparison. Operator opt-in lets the v0.5.13 baseline stay stable until a calibration run measures the hybrid lift on the golden corpus.
- **--judge mode pairs cleanly**: enabling both `HYBRID_RETRIEVAL_ENABLED=1` and `EVAL_JUDGE=1` in the same run measures retrieval quality and answer faithfulness simultaneously. The default-off discipline means the operator turns hybrid on with intent, not by accident.
- **Failure-mode containment**: if the FTS index has a bug (e.g. `english` config doesn't tokenize ZN domain terms correctly), enabling it for the live demo would break the public RAG demo (closing T-01 was about preserving that demo). Env-flag opt-in lets the calibration run happen on a non-demo workspace first.

## Consequences

### Positive

- **Fourth graduation in four ships**. T-01 (v0.5.11) → I-01 (v0.5.12) → ADR-0049 § 8th arc (v0.5.13) → ADR-0011 (v0.5.14). The ADR-0059 honest-disclose-and-deferred-plan TTL pattern keeps producing closures. Brand signal: deferred items in this codebase have a real reasonable expectation of being shipped, not perpetually deferred.
- **Lexical recall surfaces chunks vector kNN misses**. Keyword-heavy queries ("HNSW", "LexoRank", "VERSION_MISMATCH" — proper nouns / API names / error codes) often have small embedding distances to too many chunks; lexical FTS surfaces the exact-match chunks reliably. RRF combination preserves vector's paraphrase-tolerance for natural-language queries.
- **9 Vitest cases on `rrf.ts`** pin the fusion invariants: rank preservation in single-list mode, score equivalence on symmetric merges, two-list dominance over one-list, per-source provenance, weight bias, limit option, custom k, empty-list handling, id-collision semantics. The fusion math is structurally tested.
- **Schema canary updated** so a future operator who reverts the migration (or a build that doesn't run it) trips the smoke gate within 6 hours per ADR-0057 axis 2.
- **No new ops surface**. Postgres native FTS uses the same Neon connection pool, the same auth, the same backup story. ADR-0046 free-tier compliance preserved.
- **Per-source provenance in result objects** lets a future debug UI / hiring sim probe show "this chunk surfaced via lexical FTS at rank 2, not vector — query had domain-specific terms vector embeddings didn't cluster". Audit-survivable retrieval debugging.

### Negative

- **`HYBRID_RETRIEVAL_ENABLED` is not yet calibrated against the golden corpus**. The default-off discipline means a calibration run is required to measure whether hybrid actually improves the v4 OR-mode pass-rate or the --judge mean. v0.5.14 ships the mechanism; v0.6.0 candidate is the calibration ADR that sets the env flag default to `1` if hybrid measurably outperforms.
- **`ts_rank_cd` is BM25-equivalent in spirit, not strict BM25**. A future operator who needs strict BM25 ranking semantics (e.g. for academic comparability) would need pgbm25 / paradedb when Neon supports them. Acceptable trade-off for v0.5.14; the FTS path covers the load-bearing keyword-recall use case.
- **English-only tokenization**. `to_tsvector('english', content)` is hardcoded. Multi-language corpora would need either a per-document language column + dispatch to the right tsvector config, or `simple` config (no stemming, no stop-word removal). v0.7.0+ candidate; deferred until a non-English corpus lands.
- **Cohere Rerank still deferred**. ADR-0011 named three components: hybrid + RRF + Cohere Rerank. v0.5.14 ships hybrid + RRF; Cohere Rerank requires a billable API key (breaks ADR-0046) and would need a separate honest-disclose entry alongside the existing T-09 (live quota state). Deferred to a future ADR after measuring whether the Knowlex retrieval depth needs cross-encoder reranking at portfolio-scale corpus sizes.
- **GIN index storage is on Neon Free tier disk**. Free-tier limit is 0.5 GB. At ~150-300 bytes index entry per chunk + ~1.5x for the tsvector column itself, ~10k chunks consume ~3-5 MB total. Negligible. Documented for future scale planning.

## Alternatives

- **Replace pure-cosine kNN with hybrid as the default**. Rejected — invalidates run-to-run eval comparability without prior calibration. Default-off + opt-in is the discipline.
- **Use pgbm25 / paradedb for true BM25**. Rejected at v0.5.14 because Neon doesn't yet support them; reaches the same target via Postgres-native FTS at zero ops cost. Re-evaluate when Neon supports a BM25-class extension.
- **Score normalization (CombSUM / CombMNZ) instead of RRF**. Rejected — see § Why RRF over score normalization. Score-fusion methods are sensitive to candidate-pool boundaries; RRF is rank-only.
- **Cohere Rerank as a third stage**. Deferred — requires billable API key, breaks ADR-0046. Re-evaluate once an honest-disclose entry catalogues the cost / brand trade-off.
- **Move `HYBRID_RETRIEVAL_ENABLED` default to `1` immediately**. Rejected — changing default behavior in the same ship that introduces the mechanism conflates "is the mechanism correct?" with "is hybrid better?". Two separate ratchets cleanly separates the bring-up debug from the calibration measurement.

## Implementation status

Shipped in v0.5.14:

- `apps/knowledge/prisma/migrations/20260428_chunk_fts/migration.sql` (new) — additive `tsv` column + GIN index.
- `apps/knowledge/prisma/schema.prisma` — `Chunk.tsv Unsupported("tsvector")?` declared for migrate-deploy parity.
- `apps/knowledge/src/server/rrf.ts` (new) — RRF fusion module with weight + custom-k support and per-source provenance.
- `apps/knowledge/src/server/rrf.test.ts` (new) — 9 Vitest cases pinning the fusion invariants.
- `apps/knowledge/src/server/retrieve.ts` — `retrieveVector` + `retrieveLexical` helpers, `HYBRID_RETRIEVAL_ENABLED` env flag, hybrid path with RRF + materialisation, `RetrievedChunk.hybridSources` provenance field.
- `apps/knowledge/src/app/api/health/schema/route.ts` — schema canary `EXPECTED.Chunk` extended with `tsv`.
- This ADR.
- `docs/adr/0011-hybrid-search-rerank.md` — § Status updated from "Accepted (planned)" to "Fully Accepted (hybrid + RRF shipped v0.5.14 / ADR-0063; Cohere Rerank still deferred)".

### Calibration status (2026-04-29 / v0.5.15-rc.0)

A calibration attempt at v0.5.15-rc.0 surfaced an architectural gap: post-v0.5.12 multi-tenant transition (ADR-0061 line 52) intentionally omits the CI Credentials provider for Knowlex, so the unauthenticated `apps/knowledge/scripts/eval.ts` cannot ingest fresh corpus on a post-v0.5.12 server. The hybrid lift figure named as a v0.6.0 follow-up in this ADR's § Negative consequence #1 is therefore not yet produced. The closure path is a next-available-NNNN follow-up that ships the CI Credentials provider for Knowlex (copying the apps/collab triple-gate pattern from ADR-0038) and produces the lift figure as a byproduct. Full discovery + TTL + accelerator triggers in [ADR-0064](0064-hybrid-retrieval-calibration-architectural-gap.md). Until that ADR ships, the calibration command in § Verification "Live exercise" below returns 401 on the first ingest call against a post-v0.5.12 server (prod or local-with-fresh-DB).

- `docs/adr/README.md` — index entry.
- `CHANGELOG.md` — v0.5.14 entry.
- `docs/adr/_claims.json` — ADR-0063 entries (RRF module exists, retrieve.ts contains hybrid wiring, schema canary covers tsv column, FTS migration shipped).
- README + portfolio-lp + page.tsx Stat block — ADR count 61 → 62; Vitest 256 → 265 (174 collab + 91 knowledge, +9 rrf.test.ts).

### Verification

```bash
node scripts/check-doc-drift.mjs          # → 0 failures (ADR 62, Vitest 265)
node scripts/check-adr-claims.mjs         # → all pass; ADR-0063 _claims.json entries
node scripts/check-adr-refs.mjs           # → 0 dangling
pnpm --filter knowledge test              # → 91 passed (was 82, +9 rrf.test.ts)
```

Live exercise (post-merge, when an operator wants to try hybrid):

```bash
HYBRID_RETRIEVAL_ENABLED=1 \
  EVAL_JUDGE=1 \
  GEMINI_API_KEY=<your AI Studio key> \
  E2E_BASE_URL=https://craftstack-knowledge.vercel.app \
  pnpm --filter knowledge eval

# Calibration: compare report aggregate.passRate / aggregate.judge.meanScore
# against the same eval run with HYBRID_RETRIEVAL_ENABLED unset. If
# hybrid measurably wins, a future ratchet can promote the flag default
# to `1` and document the calibration data in a future ADR (next available NNNN).
```

The retrieved-chunk objects gain `hybridSources` field showing which list(s) surfaced each chunk and at what rank inside each — useful for debugging hybrid behaviour at the per-question level.
