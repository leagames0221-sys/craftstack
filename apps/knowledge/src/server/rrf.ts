/**
 * Reciprocal Rank Fusion (RRF) for hybrid retrieval (ADR-0063).
 *
 * Given multiple ranked lists (e.g. a vector kNN list + a lexical FTS
 * list), RRF combines them into a single ranking by summing
 * `1 / (k + rank_i)` across every list the document appears in. The
 * `k` constant (typically 60) damps the contribution of low-ranked
 * positions so a document at rank 1 in one list dominates a document
 * at rank 30 in two lists, which matches retrieval intuition.
 *
 * Why RRF over score normalization:
 *   - Vector cosine distance ∈ [0, 2] and FTS ts_rank_cd is unbounded
 *     positive. Normalizing them into a comparable scale requires
 *     either calibration data or arbitrary scaling that distorts the
 *     signal at the boundaries.
 *   - RRF is rank-only (no scores needed), so it sidesteps the
 *     normalization problem entirely. Cormack et al. (2009) showed
 *     RRF outperforms or matches more complex fusion strategies on
 *     TREC retrieval benchmarks with `k = 60` as the canonical default.
 *   - When the operator wants to bias toward one list (e.g. "lexical
 *     for keyword queries, vector for paraphrase"), they can scale
 *     each list's contribution with `weight` rather than re-tuning a
 *     score-normalisation constant.
 */

export const RRF_K = 60;

export type RankedItem = { id: string };

/**
 * Fuse multiple ranked lists into one. Each input list is a list of
 * items in rank order (rank 0 = best). Items are merged by id; the
 * fused score is the sum of `weight / (RRF_K + rank)` over every list
 * the item appears in. Output is sorted by descending fused score.
 *
 * Returns a list of `{ id, score, sources }` where `sources` is a
 * record of which input lists contributed (and at what rank). This
 * lets callers expose "found via vector kNN at rank 2 + lexical FTS
 * at rank 5" provenance, which is useful for debugging hybrid
 * behaviour and is in the report JSON for axis-7-style ADR claims.
 */
export function fuseRRF<T extends RankedItem>(
  lists: { name: string; items: T[]; weight?: number }[],
  opts: { limit?: number; k?: number } = {},
): {
  id: string;
  score: number;
  sources: Record<string, number>;
}[] {
  const k = opts.k ?? RRF_K;
  const acc = new Map<
    string,
    { score: number; sources: Record<string, number> }
  >();

  for (const { name, items, weight } of lists) {
    const w = weight ?? 1;
    for (let rank = 0; rank < items.length; rank++) {
      const id = items[rank].id;
      // RRF contribution. The +1 keeps the first item from being
      // assigned 1/k (the same as the second item from a different
      // list), which would erase the rank-1 advantage. Most published
      // RRF implementations index from 1, not 0, so this matches the
      // expected mathematical shape.
      const contrib = w / (k + (rank + 1));
      const prev = acc.get(id);
      if (prev) {
        prev.score += contrib;
        prev.sources[name] = rank;
      } else {
        acc.set(id, { score: contrib, sources: { [name]: rank } });
      }
    }
  }

  const sorted = [...acc.entries()]
    .map(([id, v]) => ({ id, score: v.score, sources: v.sources }))
    .sort((a, b) => b.score - a.score);

  return opts.limit ? sorted.slice(0, opts.limit) : sorted;
}
