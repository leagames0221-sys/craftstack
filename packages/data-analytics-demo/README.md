# @craftstack/data-analytics-demo

> **Status**: Phase 0 scaffold (T-01 / T-02 complete). Pipeline stages T-03 onward are placeholders that exit 1 with a TODO message. See [ADR-0070](../../docs/adr/0070-data-analytics-demo-polyglot-adoption.md) for the design.

Local-only SaaS customer-analytics demo: synthetic data → SQL marts (dbt) → ML (churn + upsell) → narrative (local LLM via Ollama) → BI dashboard (Evidence) → KPI semantic layer (MetricFlow).

## Constraints (load-bearing — see ADR-0070)

- **Zero credit card** — no Snowflake, BigQuery, Anthropic, OpenAI, or any paid service. Synthetic data only.
- **Local LLM only** — narrative generation runs against a local Ollama server. No external network calls.
- **Consumer laptop** — designed to complete `make demo` on a developer laptop in under 5 minutes.
- **Synthetic data only** — no real customer PII. Faker + DuckDB tpcds generate everything.

## Quickstart

```bash
# 1. Install the package (editable, with dev extras)
make install

# 2. Make sure Ollama is running locally and the model is pulled
ollama serve &
ollama pull llama3.1:8b-instruct-q4_K_M

# 3. Run the full pipeline
make demo
```

`make demo` chains: `data → dbt → ml → narrative → dashboard`. Any stage failure halts the pipeline with a non-zero exit code.

## Layout

| Path                       | Role                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `pyproject.toml`           | Python package definition + pinned deps (DuckDB ≥ 1.4.2 for CVE-2025-64429) |
| `package.json`             | pnpm workspace member (script proxies to Makefile)                          |
| `Makefile`                 | Single entry point — every stage has a target                               |
| `src/data_analytics_demo/` | Python source (data gen, ML, narrative)                                     |
| `dbt_project/`             | dbt project (staging / intermediate / marts)                                |
| `dashboard/`               | Evidence BI sub-project (static HTML build)                                 |
| `semantic/`                | MetricFlow KPI definitions                                                  |
| `warehouse/`               | Generated DuckDB file lives here (gitignored)                               |
| `ml/artifacts/`            | Generated model + SHAP outputs (gitignored)                                 |
| `tests/`                   | pytest suite covering each layer                                            |

## Prior art (pattern extraction only, no clone)

Six OSS projects supply the design pattern; everything is reimplemented from scratch in this package. License + maintenance verified 2026-05-17. See ADR-0070 for the full table including a rejected candidate.

## License

MIT — same as the craftstack monorepo.
