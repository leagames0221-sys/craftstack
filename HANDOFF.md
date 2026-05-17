# Active Work Handoff

Tracks ephemeral in-progress state between AI-assisted sessions. For shipped state and design decisions, see [CHANGELOG.md](CHANGELOG.md) and [docs/adr/](docs/adr/).

## Current

- **last session**: 2026-05-18
- **status**: stable on main; `@craftstack/data-analytics-demo` 0.1.0 shipped (PRs #82 #83 #86 #87 #88 #89 #90 #91 #92)
- **active work item**: none in progress
- **next planned**: TBD — pipeline complete and reproducible via `make demo` inside `packages/data-analytics-demo/`
- **blockers**: none

### Shipped — data-analytics-demo (2026-05-18)

Local-only SaaS customer-analytics demo. Six pipeline layers (data / dbt / ml / narrative / dashboard / semantic) plus polyglot CI infrastructure. See [ADR-0070](docs/adr/0070-data-analytics-demo-polyglot-adoption.md) for the design and the dashboard pivot (Evidence → self-built Python + Jinja2 + Plotly).

Quickstart: `cd packages/data-analytics-demo && make install && ollama serve & && make demo`.

## Update protocol

When ending a session with active in-progress work, update this file:

1. `last session` — today's date (YYYY-MM-DD)
2. `status` — 1-line summary of where the tree is
3. `active work item` — file paths + what was just done in 1-2 lines
4. `next planned` — concrete next step in 1 line
5. `blockers` — if any (deps, decisions pending, external waits)

When starting a session:

1. Read this file first to recover ephemeral context
2. Read recent commits (`git log -10 --oneline`) for the shipped delta
3. Read the relevant ADR(s) under [docs/adr/](docs/adr/) if the active work has design implications

## What lives where

| Information                 | Location                     | Lifetime   |
| --------------------------- | ---------------------------- | ---------- |
| Ephemeral in-progress state | this file                    | days–weeks |
| Decisions (why we chose X)  | [docs/adr/](docs/adr/)       | permanent  |
| Shipped feature log         | [CHANGELOG.md](CHANGELOG.md) | permanent  |
| Conventions & rules for AI  | [apps/\*/AGENTS.md](apps/)   | permanent  |
