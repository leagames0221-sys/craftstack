"""Plotly figure builders. Each function returns an HTML string ready to embed."""

from __future__ import annotations

from typing import TYPE_CHECKING

import plotly.express as px

if TYPE_CHECKING:
    import pandas as pd

# CDN keeps the per-page HTML small (~10KB instead of 4MB inline plotly.js).
PLOTLY_JS_MODE = "cdn"


def _to_div(fig: object) -> str:
    """Render a plotly figure as a div fragment (no <html><body>)."""
    html: str = fig.to_html(  # type: ignore[attr-defined]
        include_plotlyjs=PLOTLY_JS_MODE,
        full_html=False,
        config={"displaylogo": False},
    )
    return html


def rfm_bar(df: pd.DataFrame) -> str:
    fig = px.bar(
        df,
        x="rfm_segment",
        y="customers",
        text="customers",
        title="Customers per RFM segment",
    )
    fig.update_layout(xaxis_title="Segment", yaxis_title="Customers", height=400)
    return _to_div(fig)


def rfm_scatter(df: pd.DataFrame) -> str:
    fig = px.scatter(
        df,
        x="recency_days",
        y="frequency_events",
        color="rfm_segment",
        size="monetary_usd",
        hover_data=["customer_id"],
        title="Recency × Frequency (size = monetary)",
    )
    fig.update_layout(
        xaxis_title="Recency (days; lower is better)",
        yaxis_title="Frequency (event count)",
        height=520,
    )
    return _to_div(fig)


def churn_by_tier_bar(df: pd.DataFrame) -> str:
    fig = px.bar(
        df,
        x="current_plan_tier",
        y="churn_pct",
        text="churn_pct",
        title="Churn rate by plan tier",
    )
    fig.update_layout(xaxis_title="Plan tier", yaxis_title="Churn %", height=400)
    return _to_div(fig)


def signups_line(df: pd.DataFrame) -> str:
    fig = px.line(df, x="month", y="signups", title="Monthly signups")
    fig.update_layout(xaxis_title="Month", yaxis_title="New customers", height=400)
    return _to_div(fig)


def paid_invoice_area(df: pd.DataFrame) -> str:
    fig = px.area(
        df,
        x="month",
        y="paid_amount_usd",
        title="Paid invoice volume per month (USD)",
    )
    fig.update_layout(xaxis_title="Month", yaxis_title="USD", height=400)
    return _to_div(fig)


def cohort_heatmap(df: pd.DataFrame) -> str:
    pivot = df.pivot_table(
        index="cohort_month", columns="months_since_signup", values="retention_pct"
    )
    fig = px.imshow(
        pivot,
        labels={"x": "Months since signup", "y": "Cohort month", "color": "Retention %"},
        title="Cohort retention heatmap",
        color_continuous_scale="Blues",
        aspect="auto",
    )
    fig.update_layout(height=480)
    return _to_div(fig)
