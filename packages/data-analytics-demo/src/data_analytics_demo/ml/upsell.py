"""Upsell-propensity pipeline (T-07).

Reads the `upsell_opportunities` mart (free / pro customers only), trains a
LogisticRegression propensity model on a stratified train/test split, and
saves:

- `ml/artifacts/upsell_model.pkl`
- `ml/artifacts/upsell_metadata.json` — metrics including lift @ top-10%
- `ml/artifacts/upsell_lift_report.json` — decile breakdown

The lift @ top-10% metric is the AC-3.7 acceptance gate (must be ≥ 1.5×
the overall positive rate).
"""

from __future__ import annotations

import json
import pickle  # noqa: S403
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import _io

CATEGORICAL = ["plan_tier_at_signup", "current_plan_tier", "region"]
NUMERIC = [
    "event_count_total",
    "premium_event_count",
    "advanced_event_count",
    "active_days",
    "lifetime_paid_usd",
]
LABEL = "upgraded"


def _lift_at_decile(y_true: np.ndarray, scores: np.ndarray, top_pct: float) -> float:
    """Lift @ top-`top_pct` = positive rate in top slice / overall positive rate."""
    if len(y_true) == 0:
        return 0.0
    n_top = max(1, int(np.ceil(len(y_true) * top_pct)))
    order = np.argsort(scores)[::-1]
    top_idx = order[:n_top]
    top_rate = float(np.mean(y_true[top_idx]))
    overall_rate = float(np.mean(y_true))
    if overall_rate <= 0:
        return 0.0
    return top_rate / overall_rate


def train_and_save(  # noqa: PLR0913
    *,
    duckdb_path: Path | None = None,
    artifacts_dir: Path | None = None,
    random_state: int = _io.DEFAULT_RANDOM_STATE,
    test_size: float = 0.2,
    min_lift_top_10pct: float = 1.5,
) -> dict[str, Any]:
    """Train the upsell propensity model, persist artifacts, return metadata."""
    _io.emit("loading upsell_opportunities mart")
    df = _io.read_mart("upsell_opportunities", duckdb_path)

    x = df[CATEGORICAL + NUMERIC]
    y = df[LABEL].astype(int)

    _io.emit(f"train/test split (n={len(df)}, test_size={test_size})")
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=test_size, random_state=random_state, stratify=y
    )

    pipe = Pipeline(
        [
            (
                "pre",
                ColumnTransformer(
                    [
                        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
                        ("num", StandardScaler(), NUMERIC),
                    ],
                    remainder="drop",
                ),
            ),
            ("clf", LogisticRegression(max_iter=1000, random_state=random_state)),
        ]
    )

    _io.emit("training upsell propensity (LogisticRegression)")
    pipe.fit(x_train, y_train)

    scores = pipe.predict_proba(x_test)[:, 1]
    y_test_np = y_test.to_numpy()
    roc_auc = float(roc_auc_score(y_test_np, scores))
    lift_10 = _lift_at_decile(y_test_np, scores, top_pct=0.10)
    lift_20 = _lift_at_decile(y_test_np, scores, top_pct=0.20)

    _io.emit(f"  ROC-AUC={roc_auc:.4f}  lift@10%={lift_10:.2f}x  lift@20%={lift_20:.2f}x")

    if lift_10 < min_lift_top_10pct:
        raise RuntimeError(
            f"upsell lift @ top-10% {lift_10:.2f}x "
            f"< AC-3.7 floor {min_lift_top_10pct}x"
        )

    out_dir = _io.ensure_artifacts_dir(artifacts_dir)
    model_path = out_dir / "upsell_model.pkl"
    with model_path.open("wb") as f:
        pickle.dump(pipe, f)  # noqa: S301

    lift_report = {
        "lift_at_top_10pct": lift_10,
        "lift_at_top_20pct": lift_20,
        "overall_positive_rate": float(np.mean(y_test_np)),
        "n_test": int(len(y_test_np)),
    }
    (out_dir / "upsell_lift_report.json").write_text(
        json.dumps(lift_report, indent=2), encoding="utf-8"
    )

    metadata = {
        "task": "upsell_propensity",
        "chosen_model": "logistic_regression",
        "metrics": {
            "roc_auc_test": roc_auc,
            "lift_at_top_10pct": lift_10,
            "lift_at_top_20pct": lift_20,
        },
        "n_train": int(len(x_train)),
        "n_test": int(len(x_test)),
        "positive_rate": float(np.mean(y)),
        "features": {"categorical": CATEGORICAL, "numeric": NUMERIC},
        "artifacts": {
            "model": str(model_path.name),
            "lift_report": "upsell_lift_report.json",
        },
        "random_state": random_state,
    }
    (out_dir / "upsell_metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    _io.emit(f"done — lift@10%={lift_10:.2f}x")
    return metadata


if __name__ == "__main__":
    train_and_save()
