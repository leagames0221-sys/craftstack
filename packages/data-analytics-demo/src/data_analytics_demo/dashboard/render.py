"""Self-built static-HTML dashboard renderer.

Entry point for `make dashboard` and `data-analytics-demo dashboard`. Reads
the dbt marts produced by `make dbt`, builds Plotly figures, and writes
`dashboard/build/{index,rfm,churn,kpi}.html`.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

import duckdb
from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..ml import _io
from . import charts, queries

PAGE_NAMES = ("index", "rfm", "churn", "kpi")


def _emit(msg: str) -> None:
    print(f"[dashboard] {msg}", file=sys.stderr, flush=True)  # noqa: T201


def _templates_dir() -> Path:
    return Path(__file__).resolve().parent / "templates"


def _default_build_dir() -> Path:
    return _io.package_root() / "dashboard" / "build"


def _build_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(_templates_dir()),
        autoescape=select_autoescape(["html", "html.j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _common_context(con: duckdb.DuckDBPyConnection) -> dict[str, object]:
    return {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "headline": queries.headline_metrics(con),
        "pages": PAGE_NAMES,
    }


def main(
    *,
    duckdb_path: Path | None = None,
    build_dir: Path | None = None,
) -> Path:
    """Render every page; return the build directory path."""
    db = duckdb_path or _io.default_warehouse_path()
    if not db.exists():
        raise FileNotFoundError(
            f"warehouse not found at {db}. "
            "Run `make data` and `make dbt` before `make dashboard`."
        )
    out = build_dir or _default_build_dir()
    out.mkdir(parents=True, exist_ok=True)

    _emit(f"reading marts from {db}")
    con = duckdb.connect(str(db))
    try:
        ctx = _common_context(con)

        _emit("rendering index.html")
        rfm_bar_html = charts.rfm_bar(queries.rfm_distribution(con))
        churn_bar_html = charts.churn_by_tier_bar(queries.churn_by_tier(con))
        signups_html = charts.signups_line(queries.monthly_signups(con))
        _write(
            out / "index.html",
            "index.html.j2",
            {**ctx, "rfm_bar": rfm_bar_html, "churn_bar": churn_bar_html, "signups": signups_html},
        )

        _emit("rendering rfm.html")
        _write(
            out / "rfm.html",
            "rfm.html.j2",
            {
                **ctx,
                "rfm_bar": charts.rfm_bar(queries.rfm_distribution(con)),
                "rfm_scatter": charts.rfm_scatter(queries.rfm_scatter(con)),
                "rfm_table": queries.rfm_distribution(con).to_html(
                    index=False, classes="data-table"
                ),
            },
        )

        _emit("rendering churn.html")
        _write(
            out / "churn.html",
            "churn.html.j2",
            {
                **ctx,
                "churn_bar": charts.churn_by_tier_bar(queries.churn_by_tier(con)),
                "buckets_table": queries.churn_activity_buckets(con).to_html(
                    index=False, classes="data-table"
                ),
            },
        )

        _emit("rendering kpi.html")
        _write(
            out / "kpi.html",
            "kpi.html.j2",
            {
                **ctx,
                "signups": charts.signups_line(queries.monthly_signups(con)),
                "paid_area": charts.paid_invoice_area(queries.monthly_paid_invoice_volume(con)),
                "cohort_heatmap": charts.cohort_heatmap(queries.cohort_retention_grid(con)),
            },
        )
    finally:
        con.close()

    _emit(f"done — {len(PAGE_NAMES)} pages in {out}")
    return out


def _write(path: Path, template_name: str, context: dict[str, object]) -> None:
    env = _build_env()
    template = env.get_template(template_name)
    path.write_text(template.render(**context), encoding="utf-8")


if __name__ == "__main__":
    main()
