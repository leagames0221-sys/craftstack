"""Tests for the self-built dashboard generator (T-09 / AC-5.1〜5.4)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from data_analytics_demo.dashboard import render
from data_analytics_demo.data import generate

try:
    from dbt.cli.main import dbtRunner

    DBT_AVAILABLE = True
except ImportError:
    DBT_AVAILABLE = False


def _materialize_marts(tmp_path: Path) -> Path:
    duckdb_path = tmp_path / "analytics.duckdb"
    generate.main(
        n_customers=300,
        n_subscriptions=600,
        n_events=6_000,
        n_invoices=900,
        seed=42,
        output_path=duckdb_path,
    )
    pkg_root = Path(__file__).resolve().parent.parent
    dbt_dir = pkg_root / "dbt_project"
    os.environ["DBT_DUCKDB_PATH"] = str(duckdb_path)
    runner = dbtRunner()
    result = runner.invoke(
        [
            "run",
            "--project-dir",
            str(dbt_dir),
            "--profiles-dir",
            str(dbt_dir),
            "--quiet",
        ]
    )
    if not result.success:
        raise RuntimeError(f"dbt run failed: {result.exception}")
    return duckdb_path


@pytest.fixture(scope="module")
def materialized_warehouse(tmp_path_factory: pytest.TempPathFactory) -> Path:
    if not DBT_AVAILABLE:
        pytest.skip("dbt not importable")
    return _materialize_marts(tmp_path_factory.mktemp("dashboard"))


# ---- AC-5.1: `make dashboard` produces static HTML ------------------------

def test_ac_5_1_renders_all_pages(materialized_warehouse: Path, tmp_path: Path) -> None:
    out = tmp_path / "build"
    written = render.main(duckdb_path=materialized_warehouse, build_dir=out)
    assert written == out
    for page in ("index", "rfm", "churn", "kpi"):
        path = out / f"{page}.html"
        assert path.exists(), f"missing {page}.html"
        content = path.read_text(encoding="utf-8")
        assert content.startswith("<!doctype html>"), f"{page}.html not valid HTML"


# ---- AC-5.2: ≥ 3 sections in output ---------------------------------------

def test_ac_5_2_index_includes_required_sections(
    materialized_warehouse: Path, tmp_path: Path
) -> None:
    out = tmp_path / "build"
    render.main(duckdb_path=materialized_warehouse, build_dir=out)
    index = (out / "index.html").read_text(encoding="utf-8")
    assert "RFM segment distribution" in index
    assert "Churn rate by plan tier" in index
    assert "Monthly signups" in index


# ---- AC-5.3: connects to same analytics.duckdb ----------------------------

def test_ac_5_3_uses_provided_duckdb(materialized_warehouse: Path, tmp_path: Path) -> None:
    out = tmp_path / "build"
    render.main(duckdb_path=materialized_warehouse, build_dir=out)
    # Headline metric block reflects the seeded data sizing (300 customers).
    index = (out / "index.html").read_text(encoding="utf-8")
    assert ">300<" in index, "customer count should match seeded data"


# ---- AC-5.4: missing duckdb → fail with clear error ----------------------

def test_ac_5_4_missing_warehouse_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="warehouse not found"):
        render.main(
            duckdb_path=tmp_path / "does_not_exist.duckdb",
            build_dir=tmp_path / "build",
        )
