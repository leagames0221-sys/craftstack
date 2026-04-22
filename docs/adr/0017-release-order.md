# ADR-0017: Boardly-first release order

- Status: Accepted
- Date: 2026-04-22
- Tags: portfolio, risk

## Context

Building two production-grade apps solo in 16 weeks carries real delivery risk. A single "70% done" repository is worse than one shipped app.

## Decision

Ship Boardly by the end of Week 10 — deployed, documented, demo-videoed, E2E green. Start applying to roles immediately. Begin Knowlex in Week 9 reusing the shared foundation; ship by Week 16.

## Consequences

Positive:

- Worst case: one polished portfolio app exists by Week 10
- Application activity can start halfway through the build
- Two shipped apps if everything goes to plan

Negative:

- Knowlex-only work has a shorter runway
- Shared-foundation churn impacts both apps simultaneously

## Alternatives

- Build both in parallel from day one: rejected — heightens "one half-built each" risk
