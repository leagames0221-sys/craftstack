"""Self-built static-HTML dashboard generator (replaces Evidence per ADR-0070 amend).

Reads marts from `warehouse/analytics.duckdb`, builds Plotly figures, and
renders Jinja2 templates into `dashboard/build/{index,rfm,churn,kpi}.html`.

Pure Python — no npm, no SvelteKit, no peer-dep chains. Build is
single-process and reproducible via the same seed that feeds the data
generator.
"""
