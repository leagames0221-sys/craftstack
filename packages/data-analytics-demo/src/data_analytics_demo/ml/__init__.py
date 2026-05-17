"""Machine-learning layer for the customer-analytics demo.

Two pipelines, each reading from a dbt mart and writing artifacts under
`<package-root>/ml/artifacts/`:

- `churn.train_and_save` -> `churn_features` mart -> churn model + SHAP summary
- `upsell.train_and_save` -> `upsell_opportunities` mart -> propensity model + lift report

Both pipelines are deterministic (random_state=42 by default) and fail with
clear error messages when the source mart is missing or empty.
"""
