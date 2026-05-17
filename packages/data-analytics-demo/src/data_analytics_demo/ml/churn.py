"""Churn-prediction pipeline (T-06).

Reads the `churn_features` mart, trains a LogisticRegression baseline and an
XGBoost classifier, picks the one with the higher hold-out ROC-AUC, and saves:

- `ml/artifacts/churn_model.pkl` — the chosen estimator (sklearn Pipeline)
- `ml/artifacts/churn_metadata.json` — metric snapshot + feature list
- `ml/artifacts/shap_summary.json` — top-10 SHAP features for the narrative layer

Determinism: every random-number-using step takes `random_state=42`.
"""

from __future__ import annotations

import json
import pickle  # noqa: S403
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

from . import _io, explain

CATEGORICAL = ["plan_tier_at_signup", "current_plan_tier", "region"]
NUMERIC = [
    "event_count_total",
    "distinct_event_types",
    "lifetime_paid_usd",
    "failed_invoice_count",
    "invoice_count",
    "events_last_30d",
    "lifetime_daily_avg_events",
    "recent_to_lifetime_ratio",
    "support_ticket_count",
]
LABEL = "is_churned"


def _build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
            ("num", StandardScaler(), NUMERIC),
        ],
        remainder="drop",
    )


def _expanded_feature_names(preprocessor: ColumnTransformer, df: pd.DataFrame) -> list[str]:
    preprocessor.fit(df)
    return list(preprocessor.get_feature_names_out())


def train_and_save(  # noqa: PLR0913
    *,
    duckdb_path: Path | None = None,
    artifacts_dir: Path | None = None,
    random_state: int = _io.DEFAULT_RANDOM_STATE,
    test_size: float = 0.2,
    min_roc_auc: float = 0.70,
) -> dict[str, Any]:
    """Train both models, pick the best, persist artifacts, return metadata."""
    _io.emit("loading churn_features mart")
    df = _io.read_mart("churn_features", duckdb_path)

    # Fill NaN in engineered ratio (some customers have 0 events).
    df["recent_to_lifetime_ratio"] = df["recent_to_lifetime_ratio"].fillna(0.0)

    x = df[CATEGORICAL + NUMERIC]
    y = df[LABEL].astype(int)

    _io.emit(f"train/test split (n={len(df)}, test_size={test_size})")
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=test_size, random_state=random_state, stratify=y
    )

    candidates: dict[str, Pipeline] = {
        "logistic_regression": Pipeline(
            [
                ("pre", _build_preprocessor()),
                ("clf", LogisticRegression(max_iter=1000, random_state=random_state)),
            ]
        ),
        "xgboost": Pipeline(
            [
                ("pre", _build_preprocessor()),
                (
                    "clf",
                    XGBClassifier(
                        n_estimators=200,
                        max_depth=4,
                        learning_rate=0.1,
                        eval_metric="auc",
                        random_state=random_state,
                        n_jobs=1,
                    ),
                ),
            ]
        ),
    }

    aucs: dict[str, float] = {}
    for name, pipe in candidates.items():
        _io.emit(f"training {name}")
        pipe.fit(x_train, y_train)
        proba = pipe.predict_proba(x_test)[:, 1]
        aucs[name] = float(roc_auc_score(y_test, proba))
        _io.emit(f"  {name} ROC-AUC = {aucs[name]:.4f}")

    chosen_name = max(aucs, key=aucs.get)  # type: ignore[arg-type]
    chosen = candidates[chosen_name]
    chosen_auc = aucs[chosen_name]

    if chosen_auc < min_roc_auc:
        raise RuntimeError(
            f"best model ({chosen_name}) ROC-AUC {chosen_auc:.4f} "
            f"< AC-3.2 floor {min_roc_auc}"
        )

    out_dir = _io.ensure_artifacts_dir(artifacts_dir)
    model_path = out_dir / "churn_model.pkl"
    with model_path.open("wb") as f:
        pickle.dump(chosen, f)  # noqa: S301

    # SHAP summary on the chosen model. We pass the *post-preprocessing*
    # feature matrix so SHAP sees the same shape the inner estimator does.
    pre = chosen.named_steps["pre"]
    clf = chosen.named_steps["clf"]
    feature_names = _expanded_feature_names(pre, x_train)
    x_train_transformed = pd.DataFrame(pre.transform(x_train), columns=feature_names)
    x_test_transformed = pd.DataFrame(pre.transform(x_test), columns=feature_names)

    _io.emit("computing SHAP summary")
    shap_summary = explain.compute_shap_summary(
        model=clf,
        background=x_train_transformed,
        feature_names=feature_names,
        sample=x_test_transformed,
    )
    shap_path = out_dir / "shap_summary.json"
    explain.write_summary(shap_summary, shap_path)

    metadata = {
        "task": "churn_prediction",
        "chosen_model": chosen_name,
        "metrics": {
            "roc_auc_test": chosen_auc,
            "all_models": aucs,
        },
        "n_train": int(len(x_train)),
        "n_test": int(len(x_test)),
        "positive_rate": float(np.mean(y)),
        "features": {"categorical": CATEGORICAL, "numeric": NUMERIC},
        "artifacts": {
            "model": str(model_path.name),
            "shap_summary": str(shap_path.name),
        },
        "random_state": random_state,
    }
    (out_dir / "churn_metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    _io.emit(f"done — chosen={chosen_name} ROC-AUC={chosen_auc:.4f}")
    return metadata


if __name__ == "__main__":
    train_and_save()
