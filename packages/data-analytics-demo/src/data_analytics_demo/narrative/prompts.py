"""Prompt templates for the narrative layer.

Kept here (not inline in `generate.py`) so the prompt is reviewable as a
single artifact and can be A/B-tested without touching the orchestration.
"""

from __future__ import annotations

from typing import Any

NARRATIVE_TEMPLATE = """You are an analyst writing a brief for a SaaS executive team. \
A machine-learning model has surfaced the following top drivers behind \
customer-churn predictions (ranked by mean absolute SHAP value):

{features}

Write a concise 3-paragraph narrative for the executive audience:

1. **What the model is telling us.** Summarise the dominant signal in plain \
business language, without restating the SHAP numbers.
2. **Why it matters now.** Tie the signal to revenue impact and customer \
experience; keep it actionable.
3. **Recommended next steps.** Propose 2-3 concrete experiments or playbooks \
the customer-success team could run this quarter.

Constraints:
- Avoid jargon (no "SHAP", "feature importance", "ROC-AUC" in the output).
- Do not invent metrics that the model did not surface.
- Keep total length under 350 words.
"""


def build_prompt(shap_summary: dict[str, Any]) -> str:
    """Render the SHAP summary into the executive-narrative prompt."""
    rows = []
    for feat in shap_summary.get("top_features", []):
        direction_label = (
            "raises the churn likelihood"
            if feat.get("direction") == "increases_prediction"
            else "lowers the churn likelihood"
        )
        rows.append(f"- `{feat['name']}` ({direction_label}; magnitude {feat['mean_abs_shap']:.3f})")
    features_block = "\n".join(rows) if rows else "- (no features available)"
    return NARRATIVE_TEMPLATE.format(features=features_block)
