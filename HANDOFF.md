# Active Work Handoff

Tracks ephemeral in-progress state between AI-assisted sessions. For shipped state and design decisions, see [CHANGELOG.md](CHANGELOG.md) and [docs/adr/](docs/adr/).

## Current

- **last session**: 2026-05-17
- **status**: stable on main; opacity-sanitize + handoff infra shipped (PR #79 + #80)
- **active work item**: data analytics demo package (planning phase — prior art scan done, scaffold not yet started)
- **next planned**: Spec-Driven Stage 1 Discovery for `packages/data-analytics-demo/`
- **blockers**: none

### Planned package — data-analytics-demo

Customer-behavior / SaaS-style analytics demo for portfolio. Constraints: local-only (no credit card), local LLM (Ollama), synthetic data only.

Verified prior-art seeds (license + maintenance literal-checked 2026-05-17):

| seed | license | role |
|---|---|---|
| dbt-labs/jaffle_shop_duckdb (default branch: `duckdb`) | Apache 2.0 | dbt project skeleton (staging/marts 2-tier pattern) |
| evidence-dev/evidence | MIT | BI-as-code dashboard (SQL fenced in markdown) |
| dbt-labs/metricflow | Apache 2.0 | semantic layer YAML (single KPI definition) |
| duckdb/duckdb (tpcds extension) | MIT | synthetic SaaS data via `CALL dsdgen(sf=1)` |
| ollama/ollama (Llama 3.1 8B Instruct) | MIT | local LLM for SHAP→narrative |
| Python in Plain English (Faker+DuckDB+sklearn article, 2025-09) | technique reference | churn pipeline pattern (no code clone) |

Rejected: `dbt-labs/jaffle-shop-template` (no LICENSE + 2.5y unmaintained).

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
