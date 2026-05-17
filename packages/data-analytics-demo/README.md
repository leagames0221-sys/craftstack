# @craftstack/data-analytics-demo

Customer-analytics demo for a SaaS-style data set: synthetic data → SQL marts (dbt) → ML (churn + upsell) → narrative (local LLM via Ollama) → BI dashboard (self-built static HTML) → KPI semantic layer (MetricFlow). All seven layers run on a developer laptop, no credit card, no cloud-LLM API calls.

## Why it exists

It is the portfolio answer to a data-analyst job description that explicitly names three axes:

1. **Advanced SQL + statistical modelling** — SQL marts and propensity models for churn and upsell.
2. **Business-strategy narratives** — an executive brief generated from the model's own SHAP feature importances.
3. **BI enablement** — a single source of truth (MetricFlow KPI definitions) plus a static dashboard built from the same marts.

A recruiter cloning this repo can run `make demo` and read all three deliverables in under five minutes.

## Quickstart (5 commands)

```bash
make install                                          # editable install + dev extras
ollama serve &                                        # start local Ollama
ollama pull llama3.1:8b-instruct-q4_K_M               # or set OLLAMA_MODEL to a model already pulled
make demo                                             # data → dbt → ml → narrative → dashboard → semantic
open dashboard/build/index.html                       # (or your platform equivalent)
```

`make demo` runs the full chain with a visible banner per stage. Any stage failure halts the chain with a non-zero exit code (AC-α.2).

## Layout

| Path                       | Role                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pyproject.toml`           | Python package definition + pinned deps (`duckdb >= 1.4.2` mitigates [CVE-2025-64429](https://github.com/duckdb/duckdb/security/advisories/GHSA-vmp8-hg63-v2hp))                                                                     |
| `package.json`             | pnpm workspace member (scripts proxy to `make`)                                                                                                                                                                                      |
| `Makefile`                 | Single user-facing entry point — every stage has a target; `make demo` chains all six                                                                                                                                                |
| `src/data_analytics_demo/` | Python source ([data](src/data_analytics_demo/data), [ml](src/data_analytics_demo/ml), [narrative](src/data_analytics_demo/narrative), [dashboard](src/data_analytics_demo/dashboard), [semantic](src/data_analytics_demo/semantic)) |
| `dbt_project/`             | dbt project (staging / intermediate / marts; uses `dbt-duckdb`)                                                                                                                                                                      |
| `semantic/kpi.yml`         | MetricFlow-compatible semantic models + KPI metrics (single source of truth)                                                                                                                                                         |
| `warehouse/`               | Generated DuckDB file (gitignored)                                                                                                                                                                                                   |
| `ml/artifacts/`            | Generated model + SHAP outputs (gitignored)                                                                                                                                                                                          |
| `narrative/output.md`      | Generated LLM narrative (gitignored)                                                                                                                                                                                                 |
| `dashboard/build/`         | Generated static HTML site (gitignored)                                                                                                                                                                                              |
| `tests/`                   | pytest suite — one file per layer plus an end-to-end test                                                                                                                                                                            |
| `docs/architecture.md`     | Pipeline diagram + per-layer details                                                                                                                                                                                                 |

## Verified ML metrics (CI-enforced floors)

The ML layer ships with two acceptance criteria literally asserted by the test
suite and re-checked on every push by [python-test.yml](../../.github/workflows/python-test.yml).
Both floors are enforced at `make demo` time as well — the pipeline halts with a
non-zero exit if either model regresses below floor (AC-α.2 + AC-3.2 + AC-3.7).

| Metric                   | Floor  | Model selection                                                                                                        | Test gate                                                         |
| ------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Churn — hold-out ROC-AUC | ≥ 0.70 | Higher of LogisticRegression baseline vs XGBoost; chosen model + score persisted to `ml/artifacts/churn_metadata.json` | [tests/test_ml_churn.py:82-91](tests/test_ml_churn.py) (AC-3.2)   |
| Upsell — lift @ top-10%  | ≥ 1.5× | LogisticRegression with stratified train/test; lift report persisted to `ml/artifacts/upsell_lift_report.json`         | [tests/test_ml_upsell.py:74-86](tests/test_ml_upsell.py) (AC-3.7) |

The reproduction command is `DEMO_RANDOM_SEED=42 make data && make dbt && make ml`;
seed 42 yields byte-deterministic outputs (AC-1.5). The generated
`ml/artifacts/*.json` files contain the literal achieved scores from that run —
they are gitignored because the source of truth is the regeneration command, not
a frozen snapshot.

## Architecture (one-line summary per layer)

```
data        Faker + numpy synthesise 1000 customers / 50 000 events / 2000 subscriptions / 5000 invoices into DuckDB
dbt         staging (4 views) → intermediate (2 views) → marts (rfm_segments, churn_features, upsell_opportunities, cohort_retention)
ml          LogisticRegression baseline + XGBoost on churn (ROC-AUC ≥ 0.70) + LogisticRegression on upsell (lift @ top-10% ≥ 1.5×) + SHAP summary
narrative   Local Ollama (llama3.1:8b-instruct by default; OLLAMA_MODEL env-var overridable) generates an executive markdown brief from the SHAP summary
dashboard   Self-built Python generator (Jinja2 + Plotly via CDN) emits 4 static HTML pages from the marts
semantic    MetricFlow YAML — 3 semantic models, 4 KPI metrics; structural invariants enforced by the validator
```

See [docs/architecture.md](docs/architecture.md) for the pipeline diagram and per-layer details.

## Environment variables

Every variable has a code-level default — `.env` is optional. Defaults shown match the in-code values.

| Variable               | Default                       | Purpose                                                                                              |
| ---------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DEMO_RANDOM_SEED`     | `42`                          | Master seed for Faker + numpy + sklearn; controls byte-deterministic regeneration (AC-1.5 / AC-δ.2). |
| `DEMO_N_CUSTOMERS`     | `1000`                        | Row count for the `customers` table.                                                                 |
| `DEMO_N_SUBSCRIPTIONS` | `2000`                        | Row count for the `subscriptions` table.                                                             |
| `DEMO_N_EVENTS`        | `50000`                       | Row count for the `events` table.                                                                    |
| `DEMO_N_INVOICES`      | `5000`                        | Row count for the `invoices` table.                                                                  |
| `OLLAMA_HOST`          | `http://localhost:11434`      | Local Ollama daemon endpoint used by the narrative layer.                                            |
| `OLLAMA_MODEL`         | `llama3.1:8b-instruct-q4_K_M` | Ollama model identifier; must already be pulled (`ollama pull <model>`).                             |

**Prohibited variables (AC-4.3 fail-stop):** the narrative layer raises `RuntimeError` at invocation if any of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `AZURE_OPENAI_API_KEY`, `COHERE_API_KEY` is set. All inference is local.

## Constraints (load-bearing — see [ADR-0070](../../docs/adr/0070-data-analytics-demo-polyglot-adoption.md))

- **Zero credit card.** No Snowflake / BigQuery free trial; no Anthropic / OpenAI / Gemini API.
- **Local LLM only.** Narrative generation runs against a local Ollama; the module asserts the absence of cloud-LLM credentials at invocation time (AC-4.3).
- **Consumer laptop.** End-to-end completes well under five minutes at the default seed sizing.
- **Synthetic data only.** No real PII anywhere; Faker `company_email()` / `company()` generate everything.

## Engineered ML signals (so the models have something to learn)

- **Churn**: customers without an active subscription get 4× lower event weight, and their timestamps are biased into the older half of the history window — `recent_to_lifetime_ratio` in `churn_features` correlates with the cancel label.
- **Upsell**: `feature_use_premium` / `feature_use_advanced` event distributions skew higher for paid tiers — `premium_event_count` in `upsell_opportunities` correlates with the upgrade label.

Both signals are observable through SQL alone (no leak from the data generator into the ML feature surface).

## Prior art (pattern extraction only, no clone)

Six OSS projects supplied the design pattern; everything is reimplemented from scratch in this package. License + maintenance literal-verified 2026-05-17. See [ADR-0070](../../docs/adr/0070-data-analytics-demo-polyglot-adoption.md) for the full table including a rejected candidate and the 2026-05-18 dashboard pivot.

## License

MIT — same as the rest of the craftstack monorepo.
