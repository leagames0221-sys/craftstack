"""KPI YAML validator — enforces the MetricFlow schema invariants we rely on.

Run via `python -m data_analytics_demo.semantic.validator` or
`data-analytics-demo semantic` (the make target proxies through this).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

from ..ml import _io

DEFAULT_KPI_PATH_PARTS = ("semantic", "kpi.yml")


def _emit(msg: str) -> None:
    print(f"[semantic] {msg}", file=sys.stderr, flush=True)  # noqa: T201


def default_kpi_path() -> Path:
    root = _io.package_root()
    return root.joinpath(*DEFAULT_KPI_PATH_PARTS)


@dataclass(frozen=True)
class ValidationReport:
    semantic_model_count: int
    metric_count: int
    metric_names: list[str]


class ValidationError(RuntimeError):
    """Raised when the KPI YAML fails an AC-6.x invariant."""


def _require_keys(
    name: str,
    obj: dict[str, object],
    required: tuple[str, ...],
) -> None:
    missing = [k for k in required if k not in obj]
    if missing:
        raise ValidationError(f"{name}: missing required keys {missing}")


def _validate_semantic_model(node: dict[str, object]) -> dict[str, list[str]]:
    """Return the set of dimension / measure names this model exposes."""
    _require_keys("semantic_model", node, ("name", "model", "entities", "dimensions", "measures"))
    name = str(node["name"])
    dims = node.get("dimensions", [])
    measures = node.get("measures", [])
    if not isinstance(dims, list) or not dims:
        raise ValidationError(f"semantic_model {name!r}: needs ≥ 1 dimension")
    if not isinstance(measures, list) or not measures:
        raise ValidationError(f"semantic_model {name!r}: needs ≥ 1 measure")
    return {
        "dimensions": [str(d["name"]) for d in dims if isinstance(d, dict) and "name" in d],
        "measures": [str(m["name"]) for m in measures if isinstance(m, dict) and "name" in m],
    }


def _validate_metric(
    node: dict[str, object],
    all_dims: set[str],
    all_measures: set[str],
) -> str:
    _require_keys("metric", node, ("name", "type", "type_params", "dimensions"))
    name = str(node["name"])
    tp = node.get("type_params", {})
    if not isinstance(tp, dict) or "measure" not in tp:
        raise ValidationError(f"metric {name!r}: type_params.measure is required")
    measure_ref = str(tp["measure"])
    if measure_ref not in all_measures:
        raise ValidationError(
            f"metric {name!r}: references unknown measure {measure_ref!r}"
        )
    dims = node.get("dimensions", [])
    if not isinstance(dims, list) or not dims:
        raise ValidationError(f"metric {name!r}: needs ≥ 1 dimension (AC-6.2)")
    for d in dims:
        if str(d) not in all_dims:
            raise ValidationError(
                f"metric {name!r}: references unknown dimension {d!r}"
            )
    return name


def validate(path: Path | None = None) -> ValidationReport:
    kpi_path = path or default_kpi_path()
    if not kpi_path.exists():
        raise FileNotFoundError(f"kpi.yml not found at {kpi_path}")

    _emit(f"loading {kpi_path}")
    text = kpi_path.read_text(encoding="utf-8")
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ValidationError(f"YAML parse error: {exc}") from exc

    if not isinstance(doc, dict):
        raise ValidationError("kpi.yml: top-level must be a mapping")

    semantic_models = doc.get("semantic_models", [])
    metrics = doc.get("metrics", [])
    if not isinstance(semantic_models, list) or not semantic_models:
        raise ValidationError("kpi.yml: needs ≥ 1 semantic_model")
    if not isinstance(metrics, list) or not metrics:
        raise ValidationError("kpi.yml: needs ≥ 1 metric")

    all_dims: set[str] = set()
    all_measures: set[str] = set()
    for sm in semantic_models:
        if not isinstance(sm, dict):
            raise ValidationError("semantic_models[]: items must be mappings")
        exposed = _validate_semantic_model(sm)
        all_dims.update(exposed["dimensions"])
        all_measures.update(exposed["measures"])

    metric_names: list[str] = []
    for m in metrics:
        if not isinstance(m, dict):
            raise ValidationError("metrics[]: items must be mappings")
        metric_names.append(_validate_metric(m, all_dims, all_measures))

    report = ValidationReport(
        semantic_model_count=len(semantic_models),
        metric_count=len(metrics),
        metric_names=metric_names,
    )
    _emit(
        f"OK — {report.semantic_model_count} semantic models / "
        f"{report.metric_count} metrics: {', '.join(report.metric_names)}"
    )
    return report


def main() -> ValidationReport:
    return validate()


if __name__ == "__main__":
    main()
