import { LexoRank } from 'lexorank'

/**
 * Thin wrapper around the `lexorank` package (Jira-compatible format).
 * ADR-0006 + ADR-0021: prefer an existing, battle-tested implementation
 * over a bespoke one so that bucket/boundary semantics stay correct.
 *
 * All helpers return the string serialization so Prisma can store it
 * verbatim in `position` columns (List.position, Card.position, ...).
 */

/** The rank placed before everything else. */
export function first(): string {
  return LexoRank.min().genNext().toString()
}

/** The rank placed after everything else. */
export function last(): string {
  return LexoRank.max().genPrev().toString()
}

/** Rank strictly between two neighbors; omit either end for open range. */
export function between(prev?: string | null, next?: string | null): string {
  const prevRank = prev ? LexoRank.parse(prev) : LexoRank.min()
  const nextRank = next ? LexoRank.parse(next) : LexoRank.max()
  return prevRank.between(nextRank).toString()
}

/** Stable comparator: negative / zero / positive (Array.prototype.sort style). */
export function compare(a: string, b: string): number {
  return LexoRank.parse(a).compareTo(LexoRank.parse(b))
}
