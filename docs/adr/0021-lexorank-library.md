# ADR-0021: Use existing `lexorank` npm package

- Status: Accepted
- Date: 2026-04-22
- Tags: dependency

## Context

LexoRank has subtle rules: bucket prefixes, boundary cases, rebalance triggers. Reimplementing these correctly for the portfolio is not worth the bug surface.

## Decision

Depend on the `lexorank` npm package (Jira-compatible implementation). Wrap it in `src/lib/lexorank.ts` with a narrow `first / last / between / compare` API so the rest of the codebase does not import the library directly.

## Consequences

Positive:

- Battle-tested bucket and boundary semantics
- Our wrapper is small and has 7 Vitest cases proving round-trip properties
- Replacing the library later is a single-file change

Negative:

- One external dependency, subject to supply-chain review
