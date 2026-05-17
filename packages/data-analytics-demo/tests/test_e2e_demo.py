"""End-to-end pipeline test (T-11 / AC-α.1〜3 + AC-δ.1).

Invokes each pipeline stage at the Python API level (not via shell `make`)
so the same checks run on Windows + Linux CI without depending on a
shell. Ollama is mocked at the client boundary so the narrative stage has
no daemon dependency.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

from data_analytics_demo.dashboard import render as dashboard_render
from data_analytics_demo.data import generate
from data_analytics_demo.ml import churn, upsell
from data_analytics_demo.narrative import generate as narrative_gen
from data_analytics_demo.narrative import ollama_client
from data_analytics_demo.semantic import validator

try:
    from dbt.cli.main import dbtRunner

    DBT_AVAILABLE = True
except ImportError:
    DBT_AVAILABLE = False


class _FakeOllamaClient:
    """Stand-in for `ollama.Client` so the narrative stage runs offline."""

    def __init__(self, host: str | None = None) -> None:
        self.host = host

    def chat(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "message": {
                "content": (
                    "Engagement signals dominate the churn risk picture. "
                    "Tracking trailing activity vs lifetime norm catches the at-risk "
                    "cohort early enough for customer success to act."
                )
            }
        }


def _run_dbt(dbt_dir: Path, duckdb_path: Path) -> None:
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


# ---- AC-α.1 + AC-δ.1: clean state → full pipeline → all artifacts -----------

def test_full_pipeline_produces_every_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if not DBT_AVAILABLE:
        pytest.skip("dbt not importable")

    # Stage 1 — data
    duckdb_path = tmp_path / "analytics.duckdb"
    generate.main(
        n_customers=300,
        n_subscriptions=600,
        n_events=6_000,
        n_invoices=900,
        seed=42,
        output_path=duckdb_path,
    )
    assert duckdb_path.exists()

    # Stage 2 — dbt
    pkg_root = Path(__file__).resolve().parent.parent
    dbt_dir = pkg_root / "dbt_project"
    _run_dbt(dbt_dir, duckdb_path)

    # Stage 3 — ml (churn + upsell)
    artifacts_dir = tmp_path / "ml-artifacts"
    churn_meta = churn.train_and_save(
        duckdb_path=duckdb_path, artifacts_dir=artifacts_dir, random_state=42, min_roc_auc=0.65
    )
    upsell_meta = upsell.train_and_save(
        duckdb_path=duckdb_path, artifacts_dir=artifacts_dir, random_state=42, min_lift_top_10pct=1.0
    )
    assert (artifacts_dir / "churn_model.pkl").exists()
    assert (artifacts_dir / "upsell_model.pkl").exists()
    assert (artifacts_dir / "shap_summary.json").exists()
    assert churn_meta["metrics"]["roc_auc_test"] >= 0.65
    assert upsell_meta["metrics"]["lift_at_top_10pct"] >= 1.0

    # Stage 4 — narrative (mock Ollama)
    for k in ollama_client.EXTERNAL_API_ENV_VARS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(ollama_client.ollama, "Client", _FakeOllamaClient)

    narrative_out = tmp_path / "narrative.md"
    narrative_gen.main(
        shap_path=artifacts_dir / "shap_summary.json",
        output_path=narrative_out,
    )
    text = narrative_out.read_text(encoding="utf-8")
    assert "Churn-Risk Narrative" in text
    assert "shap_summary.json" in text  # AC-4.4 citation persists in e2e
    assert "External LLM calls" in text  # AC-4.3 advertised

    # Stage 5 — dashboard
    build_dir = tmp_path / "dashboard-build"
    dashboard_render.main(duckdb_path=duckdb_path, build_dir=build_dir)
    for page in ("index", "rfm", "churn", "kpi"):
        assert (build_dir / f"{page}.html").exists()

    # Stage 6 — semantic
    report = validator.validate()
    assert report.metric_count >= 1
    assert report.semantic_model_count >= 1


# ---- AC-α.2: any stage failure halts the chain (Python-API surface) --------

def test_missing_warehouse_halts_pipeline_at_ml_stage(tmp_path: Path) -> None:
    """If the dbt marts aren't materialised, the ML stage must fail loudly."""
    with pytest.raises(FileNotFoundError, match="warehouse not found"):
        churn.train_and_save(
            duckdb_path=tmp_path / "does_not_exist.duckdb",
            artifacts_dir=tmp_path / "art",
        )


def test_missing_shap_halts_pipeline_at_narrative_stage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If the ML stage didn't run, narrative fails with a remediation hint."""
    for k in ollama_client.EXTERNAL_API_ENV_VARS:
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(FileNotFoundError, match="shap_summary.json"):
        narrative_gen.main(
            shap_path=tmp_path / "nope.json",
            output_path=tmp_path / "out.md",
        )


def test_missing_dashboard_warehouse_halts(tmp_path: Path) -> None:
    """Dashboard stage refuses to render without a warehouse."""
    with pytest.raises(FileNotFoundError, match="warehouse not found"):
        dashboard_render.main(
            duckdb_path=tmp_path / "missing.duckdb",
            build_dir=tmp_path / "build",
        )
