"""SHAP wrapper — computes top-N feature importance and writes a JSON summary.

The narrative layer (T-08) reads this JSON to ground its LLM prompt; keeping
the format stable here means the prompt template never needs raw SHAP
arrays.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import shap


def compute_shap_summary(  # noqa: PLR0913
    *,
    model: Any,
    background: pd.DataFrame,
    feature_names: list[str],
    sample: pd.DataFrame | None = None,
    sample_size: int = 200,
    top_n: int = 10,
) -> dict[str, Any]:
    """Return a {features: [...], summary: {...}} dict ready to be JSON-dumped.

    Uses TreeExplainer when the model exposes the tree API (XGBoost,
    sklearn tree ensembles), and the model-agnostic Explainer otherwise
    (LogisticRegression, etc.).
    """
    sample = sample if sample is not None else background.sample(
        n=min(sample_size, len(background)),
        random_state=42,
    )

    # Try TreeExplainer first (fast on XGBoost / GBDT); fall back to
    # the model-agnostic Explainer with a masker for linear / arbitrary
    # estimators.
    try:
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(sample)
    except Exception:  # noqa: BLE001
        explainer = shap.Explainer(model, background)
        shap_values = explainer(sample).values

    shap_array = np.asarray(shap_values)
    # If multi-class, take class-1 contributions; binary classification
    # often returns shape (n, k) or (n, k, 2).
    if shap_array.ndim == 3:
        shap_array = shap_array[:, :, 1]

    mean_abs = np.mean(np.abs(shap_array), axis=0)
    mean_signed = np.mean(shap_array, axis=0)

    ranked = sorted(
        zip(feature_names, mean_abs, mean_signed, strict=True),
        key=lambda t: t[1],
        reverse=True,
    )[:top_n]

    return {
        "top_features": [
            {
                "name": name,
                "mean_abs_shap": float(abs_v),
                "mean_signed_shap": float(signed),
                "direction": "increases_prediction" if signed > 0 else "decreases_prediction",
            }
            for name, abs_v, signed in ranked
        ],
        "summary": {
            "n_samples_explained": int(len(sample)),
            "n_features": int(len(feature_names)),
            "top_n_returned": int(len(ranked)),
        },
    }


def write_summary(summary: dict[str, Any], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    return out_path
