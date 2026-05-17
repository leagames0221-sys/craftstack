"""Tests for the upsell-propensity pipeline (T-07 / AC-3.6, AC-3.7)."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from data_analytics_demo.data import generate
from data_analytics_demo.ml import upsell

try:
    from dbt.cli.main import dbtRunner

    DBT_AVAILABLE = True
except ImportError:
    DBT_AVAILABLE = False


def _materialize_marts(tmp_path: Path) -> Path:
    duckdb_path = tmp_path / "analytics.duckdb"
    generate.main(
        n_customers=400,
        n_subscriptions=800,
        n_events=8_000,
        n_invoices=1_200,
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
    return _materialize_marts(tmp_path_factory.mktemp("ml-upsell"))


# ---- AC-3.6: artifacts written ---------------------------------------------

def test_ac_3_6_train_and_save_writes_artifacts(materialized_warehouse: Path, tmp_path: Path) -> None:
    out = tmp_path / "artifacts"
    meta = upsell.train_and_save(
        duckdb_path=materialized_warehouse,
        artifacts_dir=out,
        random_state=42,
        min_lift_top_10pct=1.0,  # relaxed for this test; AC-3.7 below enforces 1.5
    )
    assert (out / "upsell_model.pkl").exists()
    assert (out / "upsell_metadata.json").exists()
    assert (out / "upsell_lift_report.json").exists()
    assert meta["task"] == "upsell_propensity"


# ---- AC-3.7: lift @ top-10% ≥ 1.5× -----------------------------------------

def test_ac_3_7_lift_at_top_10pct_meets_floor(materialized_warehouse: Path, tmp_path: Path) -> None:
    meta = upsell.train_and_save(
        duckdb_path=materialized_warehouse,
        artifacts_dir=tmp_path / "art",
        random_state=42,
        min_lift_top_10pct=1.5,
    )
    assert meta["metrics"]["lift_at_top_10pct"] >= 1.5

    report = json.loads((tmp_path / "art" / "upsell_lift_report.json").read_text(encoding="utf-8"))
    assert report["lift_at_top_10pct"] >= 1.5
    assert report["overall_positive_rate"] > 0
