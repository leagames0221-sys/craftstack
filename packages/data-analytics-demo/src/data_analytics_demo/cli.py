"""CLI entry point for data-analytics-demo.

Phase 0 scaffold — sub-commands are placeholders that print a TODO message
referencing the relevant Stage 4 task. Real implementations land in T-03 onward.
"""

from __future__ import annotations

import sys

import typer

app = typer.Typer(
    help="data-analytics-demo CLI — local-only SaaS customer-analytics pipeline.",
    no_args_is_help=True,
)


@app.command()
def version() -> None:
    """Print the package version."""
    from data_analytics_demo import __version__

    typer.echo(__version__)


@app.command()
def data() -> None:
    """Generate synthetic SaaS data into warehouse/analytics.duckdb."""
    from data_analytics_demo.data import generate as gen

    out = gen.main()
    typer.echo(f"wrote {out}")


@app.command()
def ml() -> None:
    """Train churn + upsell models (writes to ml/artifacts/)."""
    from data_analytics_demo.ml import churn as churn_mod
    from data_analytics_demo.ml import upsell as upsell_mod

    churn_meta = churn_mod.train_and_save()
    upsell_meta = upsell_mod.train_and_save()
    typer.echo(
        f"churn ROC-AUC={churn_meta['metrics']['roc_auc_test']:.4f}  "
        f"upsell lift@10%={upsell_meta['metrics']['lift_at_top_10pct']:.2f}x"
    )


@app.command()
def narrative() -> None:
    """Generate LLM narrative via local Ollama (T-08, not yet implemented)."""
    typer.echo("[narrative] TODO T-08: Ollama narrative not yet implemented", err=True)
    sys.exit(1)


if __name__ == "__main__":
    app()
