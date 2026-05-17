"""Shared IO helpers for the ML layer.

Both `churn.py` and `upsell.py` read marts from the same DuckDB file and
write artifacts to the same directory; centralising the path math + the
not-empty guard keeps the per-pipeline code focused on the model.
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import pandas as pd

DEFAULT_RANDOM_STATE = 42


def package_root() -> Path:
    """Resolve the package root (one level above src/data_analytics_demo/)."""
    return Path(__file__).resolve().parents[3]


def default_warehouse_path() -> Path:
    return package_root() / "warehouse" / "analytics.duckdb"


def default_artifacts_dir() -> Path:
    return package_root() / "ml" / "artifacts"


def emit(msg: str) -> None:
    """ML-layer progress emitter — mirrors data/generate._emit format."""
    print(f"[ml] {msg}", file=sys.stderr, flush=True)  # noqa: T201


def read_mart(mart: str, duckdb_path: Path | None = None) -> pd.DataFrame:
    """Read a dbt mart into a DataFrame.

    Raises a clear error (AC-3.4) when the warehouse file is missing or the
    mart table is empty / absent.
    """
    path = duckdb_path or default_warehouse_path()
    if not path.exists():
        raise FileNotFoundError(
            f"warehouse not found at {path}. "
            "Run `make data` then `make dbt` before training."
        )
    # NOTE: opened in default (rw) mode rather than read_only=True so that
    # the same process can use both dbt's adapter (which holds an rw
    # connection) and this loader without DuckDB's "different configuration"
    # mismatch. The ML pipelines only issue SELECTs.
    con = duckdb.connect(str(path))
    try:
        try:
            # `mart` is a module-level constant string supplied by churn.py
            # and upsell.py — not user input. SQL injection guard not applicable.
            df = con.execute(f"SELECT * FROM {mart}").fetchdf()  # noqa: S608
        except duckdb.CatalogException as exc:
            raise RuntimeError(
                f"mart `{mart}` not found in {path}. "
                "Run `make dbt` to materialise the marts."
            ) from exc
    finally:
        con.close()
    if df.empty:
        raise RuntimeError(f"mart `{mart}` is empty; nothing to train on.")
    return df


def ensure_artifacts_dir(artifacts_dir: Path | None = None) -> Path:
    out = artifacts_dir or default_artifacts_dir()
    out.mkdir(parents=True, exist_ok=True)
    return out
