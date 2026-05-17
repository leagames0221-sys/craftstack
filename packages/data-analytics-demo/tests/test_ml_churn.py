"""Tests for the churn-prediction pipeline (T-06 / AC-3.1〜3.5)."""

from __future__ import annotations

import json
import pickle  # noqa: S403
from pathlib import Path

import pytest

pytest.importorskip("xgboost")

from data_analytics_demo.data import generate
from data_analytics_demo.ml import churn

try:
    from dbt.cli.main import dbtRunner

    DBT_AVAILABLE = True
except ImportError:
    DBT_AVAILABLE = False


def _materialize_marts(tmp_path: Path) -> Path:
    """Generate synthetic data + run dbt programmatically.

    Uses `dbtRunner` (in-process) instead of a subprocess so the test works
    on Windows without venv Scripts being on PATH.
    """
    duckdb_path = tmp_path / "analytics.duckdb"
    generate.main(
        n_customers=400,
        n_subscriptions=800,
        n_events=8_000,
        n_invoices=1_200,
        seed=42,
        output_path=duckdb_path,
    )
    import os

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
    return _materialize_marts(tmp_path_factory.mktemp("ml-churn"))


# ---- AC-3.1: artifacts written ---------------------------------------------

def test_ac_3_1_train_and_save_writes_artifacts(materialized_warehouse: Path, tmp_path: Path) -> None:
    out = tmp_path / "artifacts"
    meta = churn.train_and_save(
        duckdb_path=materialized_warehouse,
        artifacts_dir=out,
        random_state=42,
    )
    assert (out / "churn_model.pkl").exists()
    assert (out / "churn_metadata.json").exists()
    assert (out / "shap_summary.json").exists()
    assert meta["task"] == "churn_prediction"


# ---- AC-3.2: ROC-AUC ≥ 0.70 -------------------------------------------------

def test_ac_3_2_roc_auc_meets_floor(materialized_warehouse: Path, tmp_path: Path) -> None:
    meta = churn.train_and_save(
        duckdb_path=materialized_warehouse,
        artifacts_dir=tmp_path / "art",
        random_state=42,
        min_roc_auc=0.70,
    )
    assert meta["metrics"]["roc_auc_test"] >= 0.70


# ---- AC-3.3: SHAP summary persists ----------------------------------------

def test_ac_3_3_shap_summary_shape(materialized_warehouse: Path, tmp_path: Path) -> None:
    out = tmp_path / "shap"
    churn.train_and_save(
        duckdb_path=materialized_warehouse,
        artifacts_dir=out,
        random_state=42,
    )
    summary = json.loads((out / "shap_summary.json").read_text(encoding="utf-8"))
    assert "top_features" in summary
    assert len(summary["top_features"]) > 0
    first = summary["top_features"][0]
    assert "name" in first
    assert "mean_abs_shap" in first
    assert first["mean_abs_shap"] >= 0


# ---- AC-3.4: missing data -> clear error -----------------------------------

def test_ac_3_4_missing_warehouse_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="warehouse not found"):
        churn.train_and_save(
            duckdb_path=tmp_path / "does_not_exist.duckdb",
            artifacts_dir=tmp_path / "art",
        )


# ---- AC-3.5: determinism (same seed -> identical artifact bytes) -----------

def test_ac_3_5_deterministic_with_seed(materialized_warehouse: Path, tmp_path: Path) -> None:
    a = tmp_path / "a"
    b = tmp_path / "b"
    churn.train_and_save(duckdb_path=materialized_warehouse, artifacts_dir=a, random_state=7)
    churn.train_and_save(duckdb_path=materialized_warehouse, artifacts_dir=b, random_state=7)

    # Metric snapshots are the primary determinism contract (pickled
    # sklearn models compare equal in practice but the byte-level
    # representation can shift across runs depending on hashing).
    meta_a = json.loads((a / "churn_metadata.json").read_text(encoding="utf-8"))
    meta_b = json.loads((b / "churn_metadata.json").read_text(encoding="utf-8"))
    assert meta_a["metrics"] == meta_b["metrics"]

    # And the persisted model has the same prediction surface.
    with (a / "churn_model.pkl").open("rb") as fa, (b / "churn_model.pkl").open("rb") as fb:
        model_a = pickle.load(fa)  # noqa: S301
        model_b = pickle.load(fb)  # noqa: S301
    import duckdb

    # rw mode to match dbt's connection configuration (see ml/_io.py comment)
    con = duckdb.connect(str(materialized_warehouse))
    df = con.execute("SELECT * FROM churn_features LIMIT 50").fetchdf()
    con.close()
    df["recent_to_lifetime_ratio"] = df["recent_to_lifetime_ratio"].fillna(0.0)
    x = df[churn.CATEGORICAL + churn.NUMERIC]
    p_a = model_a.predict_proba(x)[:, 1]
    p_b = model_b.predict_proba(x)[:, 1]
    import numpy as np

    assert np.allclose(p_a, p_b)
