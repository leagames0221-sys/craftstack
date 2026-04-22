# ADR-0001: Monorepo (Turborepo + pnpm workspaces)

- Status: Accepted
- Date: 2026-04-22
- Tags: architecture, repo-structure

## Context

Boardly and Knowlex ship two separate product surfaces but share authentication, UI primitives, a logger, a DB helper, and generated API types. Keeping them in separate repositories would force publishing private npm packages or using git submodules, both of which slow the feedback loop.

## Decision

Adopt a pnpm workspaces + Turborepo monorepo with `apps/*` and `packages/*` layers. Apps: `collab`, `knowledge`. Packages: `ui`, `auth`, `db`, `logger`, `config`, `api-client`.

## Consequences

Positive:

- Cross-cutting changes land in a single PR
- Centralized lint/tsconfig/prettier via `packages/config`
- Turborepo remote caching shortens CI on repeat builds
- Demonstrates monorepo ops experience on the resume

Negative:

- Extra learning cost for root-level config
- Vercel and Fly.io deploys must specify build scope

## Alternatives

- Polyrepo: rejected — publishing overhead and type-sync friction
- Nx: rejected — heavier than the project warrants
- Lerna: rejected — maintenance stalled relative to Turborepo
