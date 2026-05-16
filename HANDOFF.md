# Active Work Handoff

Tracks ephemeral in-progress state between AI-assisted sessions. For shipped state and design decisions, see [CHANGELOG.md](CHANGELOG.md) and [docs/adr/](docs/adr/).

## Current

- **last session**: 2026-05-17
- **status**: stable on main
- **active work item**: none in progress
- **next planned**: data analytics demo package scaffold
- **blockers**: none

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

| Information | Location | Lifetime |
|---|---|---|
| Ephemeral in-progress state | this file | days–weeks |
| Decisions (why we chose X) | [docs/adr/](docs/adr/) | permanent |
| Shipped feature log | [CHANGELOG.md](CHANGELOG.md) | permanent |
| Conventions & rules for AI | [apps/*/AGENTS.md](apps/) | permanent |
