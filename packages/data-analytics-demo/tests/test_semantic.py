"""Tests for the semantic-layer validator (T-10 / AC-6.1〜6.2)."""

from __future__ import annotations

from pathlib import Path

import pytest

from data_analytics_demo.semantic import validator

# ---- AC-6.1: WHEN `make semantic-validate`, exit 0 on a valid file ---------

def test_ac_6_1_valid_file_returns_report() -> None:
    report = validator.validate()
    assert report.semantic_model_count >= 1
    assert report.metric_count >= 1
    assert all(isinstance(n, str) for n in report.metric_names)


# ---- AC-6.2: each metric has ≥ 1 dimension and ≥ 1 measure -----------------

def test_ac_6_2_each_metric_has_dim_and_measure_via_model() -> None:
    report = validator.validate()
    # validator.validate() already enforces this; the test would fail on
    # ValidationError if any metric were missing a dimension or measure.
    assert report.metric_count == len(report.metric_names)


# ---- Negative paths --------------------------------------------------------

def test_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="kpi.yml not found"):
        validator.validate(tmp_path / "nope.yml")


def test_empty_metric_dimensions_raises(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        """
semantic_models:
  - name: x
    model: "ref('stg_x')"
    entities: [{name: x, type: primary, expr: id}]
    dimensions: [{name: d, type: categorical}]
    measures: [{name: m, agg: count, expr: id}]
metrics:
  - name: bad_metric
    type: simple
    type_params: {measure: m}
    dimensions: []
""",
        encoding="utf-8",
    )
    with pytest.raises(validator.ValidationError, match="needs ≥ 1 dimension"):
        validator.validate(bad)


def test_unknown_measure_raises(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yml"
    bad.write_text(
        """
semantic_models:
  - name: x
    model: "ref('stg_x')"
    entities: [{name: x, type: primary, expr: id}]
    dimensions: [{name: d, type: categorical}]
    measures: [{name: m, agg: count, expr: id}]
metrics:
  - name: bad_metric
    type: simple
    type_params: {measure: does_not_exist}
    dimensions: [d]
""",
        encoding="utf-8",
    )
    with pytest.raises(validator.ValidationError, match="unknown measure"):
        validator.validate(bad)


# ---- Required metric inventory ---------------------------------------------

def test_includes_canonical_metrics() -> None:
    """The four headline metrics the dashboard reads must be defined."""
    report = validator.validate()
    expected = {"customers", "active_subscriptions", "monthly_recurring_revenue", "paid_invoice_volume"}
    assert expected.issubset(set(report.metric_names))
