# ADR-0070: Adopt polyglot (Python + TypeScript) for `packages/data-analytics-demo` — local-only SaaS customer-analytics demo

- Status: Accepted (amended 2026-05-18 — dashboard pivoted from Evidence to a self-built Python+Jinja2+Plotly generator; see "2026-05-18 amendment" section below)
- Date: 2026-05-17 (original), 2026-05-18 (amendment)
- Tags: architecture, polyglot, data-analytics, dbt, ollama, security, supply-chain
- Companions: [ADR-0001](0001-monorepo-turborepo-pnpm.md) (the monorepo layout this ADR extends with a polyglot package)

## Context

The monorepo has shipped two TypeScript applications (Boardly, Knowlex) on top of six TypeScript packages (`api-client / auth / config / db / logger / ui`). Every existing surface is JS/TS — no Python file at any depth (verified 2026-05-17 via `find . -name "*.py" -not -path "*/node_modules/*"` → 0 hits).

A new portfolio surface is needed: a customer-behavior analytics demo that exercises the full data-analyst delivery — SQL marts, churn / upsell propensity models, RFM segmentation, cohort retention, narrative-from-explanations, and a BI dashboard — under the same project-wide constraints as the rest of craftstack:

- **Zero credit card.** No paid SaaS, no free-trial-with-card-on-file.
- **Consumer laptop.** End-to-end must complete on a developer laptop.
- **Synthetic data only.** No real PII anywhere in the repo or in CI.
- **Local LLM only.** No external LLM API calls.
- **★★★ portable production-grade.** Same quality bar as the sibling packages.

The data-analytics tool ecosystem in 2026 splits cleanly along language lines: dbt + scikit-learn + XGBoost + SHAP + Ollama Python client + Faker are the canonical Python stack; Evidence is a JS-native BI framework. There is no credible TS-only path that meets the quality bar.

## Decision

Add `packages/data-analytics-demo/` as a polyglot package:

- **Python sub-package** (`pyproject.toml`) for data generation, dbt project execution, ML pipelines, and the Ollama narrative client.
- **TypeScript sub-package** (`dashboard/package.json`) for the Evidence BI dashboard, kept as a nested project that the top-level pnpm workspace does not directly own (avoids workspace glob pollution).
- **Single Makefile** as the user-facing entry point. Every stage has a target; `make demo` chains `data → dbt → ml → narrative → dashboard`.
- **Pinned dependencies**: `duckdb>=1.4.2` (CVE-2025-64429 mitigation), `dbt-core>=1.8`, `scikit-learn>=1.5`, `xgboost>=2.1`, `shap>=0.46`, `faker>=30`, `ollama>=0.4`, `pydantic>=2.9`, `typer>=0.14`, `dbt-metricflow>=0.13`.

The new package becomes the seventh `packages/*` entry. Existing six packages remain TypeScript-only.

## Tradeoffs

### Tradeoff 1: polyglot (adopted) vs TypeScript-only (rejected)

Data-analytics ecosystem leaders (dbt, scikit-learn, SHAP, XGBoost, Ollama bindings) are Python-first. TS equivalents are weaker or missing. A TS-only attempt would either ship a degraded analytical surface or reinvent established Python primitives — both fail the ★★★ quality bar. Polyglot CI overhead (two new workflows) is bounded and inherits from prior-art patterns the user has shipped in sibling Python projects.

### Tradeoff 2: DuckDB + Faker synthetic data (adopted) vs UCI dataset / cloud-trial datasets (rejected)

The UCI Online Retail dataset carries a research-only license that breaks commercial demo use. Snowflake and BigQuery free trials require a credit card on file once trial credits expire. DuckDB's `tpcds` extension (MIT) plus Faker (MIT) generates a deterministic synthetic SaaS schema in seconds, runs entirely local, ships under MIT, and removes any PII exposure surface.

### Tradeoff 3: dbt (adopted) vs raw SQL scripts (rejected)

Raw SQL scripts lack the staging → intermediate → marts dependency graph, schema tests, jinja templating, and `dbt docs` lineage that turn 4 mart files into a reviewable analytical surface. dbt-core (Apache 2.0) is the de-facto standard for analytical SQL in 2026; demonstrating it directly maps to the contract brief's "BI / data-mart enablement" axis.

### Tradeoff 4: Evidence (adopted) vs Streamlit / Quarto / Apache Superset (rejected)

Streamlit requires a Python server at view time (no static export, customer-side hosting required). Quarto's BI focus is weaker — it's stronger for academic publishing. Superset is a full server with significant install overhead. Evidence (MIT) emits static HTML from SQL fenced in markdown, fits the "BI as code" narrative, and runs locally without a server in the loop.

### Tradeoff 5: Ollama (adopted) vs cloud LLM API (rejected) vs no LLM (rejected)

Cloud LLM APIs require a credit card, an external network dependency, and cross the project's "no Anthropic API auto-call" rule. Skipping LLM entirely removes the "narrative for the executive layer" deliverable, which is one of the three axes the contract brief explicitly names. Ollama (MIT) with Llama 3.1 8B Instruct (Llama license, commercial use permitted) is the only path that satisfies all three constraints.

### Tradeoff 6: MetricFlow (adopted) vs Cube.js / LookML / no semantic layer (rejected)

Cube.js is JS-only, which would push the semantic layer back into the TS side and create an interop seam against a Python pipeline. LookML is proprietary to Looker / Google Cloud; non-OSS, no local hosting. Skipping the semantic layer removes the "single source of KPI definition" deliverable, weakening the "data-mart enablement" framing. MetricFlow (Apache 2.0, dbt-labs official) sits inside the Python stack already in use and is the structural match.

## Security mitigations

- **DuckDB ≥ 1.4.2** pin in `pyproject.toml`. Closes [GHSA-vmp8-hg63-v2hp / CVE-2025-64429](https://github.com/duckdb/duckdb/security/advisories/GHSA-vmp8-hg63-v2hp) (encryption crypto, medium severity, all `>= 1.4.0` affected, patched in 1.4.2). The CSV-sniff bypass ([GHSA-w2gf-jxc9-pf2q / CVE-2024-41672](https://github.com/duckdb/duckdb/security/advisories/GHSA-w2gf-jxc9-pf2q), patched 1.1.0) is also covered transitively. The GitHub Actions injection advisory ([GHSA-7q92-pph9-5686](https://github.com/duckdb/duckdb/security/advisories/GHSA-7q92-pph9-5686)) has no release impact.
- **No external API credentials.** Environment variables (synthetic-row counts, deterministic seed, local Ollama host / model) are documented in the package README under "Environment variables"; every variable has a code-level default so `.env` is optional. Ollama runs locally; the narrative module asserts the absence of external-API env vars at invocation time (AC-4.3) — `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `AZURE_OPENAI_API_KEY` / `COHERE_API_KEY` set in the environment causes `make narrative` to fail-stop with a remediation message.
- **`pip-audit` in CI**, fail on HIGH or CRITICAL severity. Wired in T-12 via a new `.github/workflows/python-audit.yml` workflow that runs alongside the existing `pnpm-audit.yml`.
- **Dependabot Python ecosystem.** T-12 adds the `pip` ecosystem to `.github/dependabot.yml` so security upgrades surface as PRs.
- **Generated artifacts gitignored.** `warehouse/*.duckdb`, `ml/artifacts/*`, `dashboard/build/`, `narrative/output.md` never enter the repo, removing accidental data-leak surface.

## Stack inheritance (six adopted, one rejected)

License + maintenance literal-verified 2026-05-17. Pattern is extracted by reading; no clone, no template-modification path.

| seed                                                                                                                                                       | license             | last push  | role                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------- | ------------------------------------------------- |
| [dbt-labs/jaffle_shop_duckdb](https://github.com/dbt-labs/jaffle_shop_duckdb) (default branch `duckdb`)                                                    | Apache 2.0          | 2026-03-02 | dbt staging / intermediate / marts pattern        |
| [evidence-dev/evidence](https://github.com/evidence-dev/evidence)                                                                                          | MIT                 | 2026-02-18 | BI-as-code dashboard                              |
| [dbt-labs/metricflow](https://github.com/dbt-labs/metricflow)                                                                                              | Apache 2.0          | 2026-05-12 | semantic layer YAML                               |
| [duckdb/duckdb tpcds extension](https://duckdb.org/docs/stable/core_extensions/tpcds)                                                                      | MIT                 | 2026-05-16 | synthetic SaaS data via `CALL dsdgen(sf=1)`       |
| [ollama/ollama](https://github.com/ollama/ollama) (Llama 3.1 8B Instruct)                                                                                  | MIT                 | 2026-05-15 | local LLM inference                               |
| [Python in Plain English article (2025-09)](https://python.plainenglish.io/python-churn-prediction-a-pipeline-with-faker-duckdb-scikit-learn-22b80608cedb) | technique reference | —          | Faker + DuckDB + sklearn churn pipeline structure |

Rejected: **dbt-labs/jaffle-shop-template** — no LICENSE file in default branch, last push 2023-09-23 (≥ 2 years unmaintained). The same-org `jaffle_shop_duckdb` (Apache 2.0, recently maintained) supplies the equivalent pattern without the legal / maintenance flags.

## Acceptance criteria

34 AC items captured in Stage 2 of the Spec-Driven workflow, organized across six layers (data / SQL marts / ML / narrative / dashboard / semantic) plus five cross-cutting concerns (pipeline orchestration, quality bar, security & privacy, reproducibility, documentation). Each AC is in EARS form (WHEN / WHILE / IF...THEN / WHERE) and is testable. The full list is preserved in this PR's review thread and in the package's `HANDOFF.md` update.

## Consequences

### Positive

- The contract brief's three axes (analysis, strategy narrative, BI enablement) map 1:1 onto the package's six layers — the demo doubles as a literal interview artifact.
- Cross-project knowhow accumulates: the same DuckDB + dbt + Faker + sklearn + Ollama stack is portable to future contract engagements without per-engagement vendor selection work.
- DuckDB 1.4.2 pin sets a precedent for the rest of the monorepo if it ever consumes DuckDB.
- A second language in the monorepo de-risks future polyglot needs (e.g., a Rust extension package) by establishing the CI pattern up front.

### Negative

- Two new CI workflows (`python-test.yml`, `python-audit.yml`) add ~1-2 minutes to per-PR CI wall time for changes touching this package.
- New contributors must install both Node and Python toolchains for end-to-end work. README quickstart covers this in ≤ 5 commands.
- The Evidence dashboard sub-project keeps its own `package.json` outside the pnpm workspace glob; future workspace re-org would need to decide whether to absorb it.
- Maintenance burden of six adopted upstreams instead of one; dbt-core's release cadence in particular needs Dependabot attention.

## Alternatives

- **TypeScript-only**: rejected — see Tradeoff 1. Cannot meet the quality bar with current TS data-analytics tooling.
- **Separate repo (polyrepo)**: rejected — contradicts the monorepo decision in ADR-0001 and forfeits the "complex portfolio operated as a single deliverable" interview signal.
- **Defer the demo**: rejected — the contract brief is live; deferring loses the matching window.

## 2026-05-18 amendment — dashboard pivot

The original Tradeoff 4 chose Evidence as the dashboard generator. Evidence is a high-quality OSS tool (MIT, evidence-dev/evidence, 6k+ stars) and the rationale stands on paper, but the integration cost in this monorepo turned out to be unbounded:

- Evidence ships a SvelteKit-based build (`evidence build`) that requires its own flat `node_modules` for `@sveltejs/kit`, `vite`, `@evidence-dev/tailwind`, and several other transitive peers to be resolvable from generated template code.
- Pnpm 10's isolated layout and strict build-script approval gate broke this in three different ways on consumer Windows; each fix surfaced the next missing peer (chain of four+ peer-dep resolution failures locally before pivoting).
- The dashboard sits at the seam between the Python pipeline (data + dbt + ML + narrative) and the static HTML output. Adopting Evidence meant adopting a second package manager (pnpm or npm) inside an otherwise-Python sub-tree, with its own audit + Dependabot + CI surface.

**Decision**: replace Evidence with a self-built Python+Jinja2+Plotly generator that lives entirely inside `src/data_analytics_demo/dashboard/`. Adds two PyPI deps (jinja2 BSD, plotly MIT — both well-known and already on the audit allowlist) and ships ~150 lines of code that read the same dbt marts and write static HTML to `dashboard/build/`.

### Why this is the better fit

- **Smaller blast radius**: 2 PyPI deps instead of 629 npm deps with the associated peer-dep tangle. Pip-audit covers the surface.
- **Single toolchain**: the dashboard now runs through the same Python venv, ruff, mypy, pytest gates as the rest of the package; no second package manager, no separate workflow.
- **Stronger portfolio signal**: "self-built static dashboard generator from synthetic SaaS marts" reads as analytics-engineering breadth; "I configured Evidence" reads as tool adoption.
- **Full layout control**: Plotly figures + Jinja2 templates give the demo the same chart types Evidence was going to produce (bar / scatter / line / area / heatmap / data table) without the SvelteKit indirection.

### Tradeoff 4 (revised)

| Option                                    | Status               | Why                                                                    |
| ----------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| **Python + Jinja2 + Plotly (self-built)** | adopted              | Single toolchain, 2 PyPI deps, full control, audit-clean               |
| Evidence                                  | rejected             | Peer-dep chain unbounded in this monorepo; second toolchain added cost |
| Streamlit                                 | rejected (unchanged) | Requires a Python server at view time; no static export                |
| Quarto                                    | rejected (unchanged) | BI focus weaker than the alternatives; CLI install required            |
| Apache Superset                           | rejected (unchanged) | Full server with significant install overhead                          |

### What the rest of this ADR still gets right

Tradeoffs 1 (polyglot), 2 (DuckDB + Faker synthetic data), 3 (dbt), 5 (Ollama), and 6 (MetricFlow) are unchanged. The security mitigations (DuckDB ≥ 1.4.2 pin, pip-audit, Dependabot) and the polyglot CI structure carry over.
