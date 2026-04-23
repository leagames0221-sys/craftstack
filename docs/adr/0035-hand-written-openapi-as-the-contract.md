# ADR-0035: Hand-written OpenAPI 3.1 spec as the API contract

- Status: Accepted
- Date: 2026-04-23
- Tags: api, documentation, tooling

## Context

The Boardly REST surface has grown to ~25 routes across workspaces, boards, lists, cards, labels, comments, invitations, notifications, search, and the Knowlex playground. Until now the contract lived implicitly in the route handler code and the client fetch calls. That's fine for a one-engineer project but it

1. denies third-party consumers a typed target — any integration would start by reverse-engineering the routes,
2. denies the author a clean "show me the whole API" surface for interview conversations,
3. denies automated tools (Scalar, Swagger Editor, ReDoc, Stoplight, openapi-typescript) something to point at.

## Decision

Ship a hand-written OpenAPI 3.1 spec at `apps/collab/src/openapi.ts`, serve it as JSON at `GET /api/openapi.json` (public, cached), and link it from the landing page footer and the README. The hand-written approach is chosen over code-generated alternatives (zod-to-openapi, next-openapi-gen, etc.) because:

- Coverage can be complete immediately, not gated on every handler being refactored onto a generator-friendly validator.
- The spec itself becomes the contract — if a handler diverges from the spec, the spec wins and the handler is the bug.
- Documentation copy is free-form English in the spec, not shoehorned into route comments.

We explicitly defer auto-generated typed clients (via `openapi-typescript` / `openapi-fetch`) to a follow-up; consumers who want types today can run those tools against the URL themselves.

## Consequences

Positive:

- Third-party tool interoperability — Swagger Editor, Scalar, Stoplight, ReDoc, Postman all accept the URL.
- Interview artifact: "here is the entire API, one scroll."
- ADR-0026/0027/0028/0029 are referenced inline in the spec so the "why" is discoverable from the "what."

Negative:

- Drift risk: a handler change without a spec change creates silent divergence. Mitigation: the spec file is in the same app tree so code review surfaces it; plus, the `/api/openapi.json` route ships it in the same deploy as the handlers, so staging an out-of-date spec is conspicuous.
- Maintenance cost: every new route is a manual spec edit. Acceptable at the current 25-route scale; worth revisiting if the surface doubles.

## Alternatives Considered

- **zod-to-openapi** — compelling because zod is already used for request validation on Knowlex. But zod is not the validation layer for the bulk of collab routes, so adoption would require a parallel rewrite of the current validators.
- **next-openapi-gen / tsoa-style decorators** — rejected; invasive refactor for every handler.
- **No spec, keep the implicit contract** — rejected; incremental cost of each addition is tiny but the deferred cost of never writing it is a portfolio-level miss.
