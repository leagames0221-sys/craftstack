"""SQL queries against the dbt marts.

Each function takes an open DuckDB connection and returns a DataFrame.
Centralising the SQL here keeps the templates focused on layout.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import duckdb
    import pandas as pd


def _scalar(con: duckdb.DuckDBPyConnection, sql: str) -> float:
    """Run a single-cell aggregate query and return the value (or 0 if empty)."""
    row = con.execute(sql).fetchone()
    if row is None:
        return 0.0
    return float(row[0])


def headline_metrics(con: duckdb.DuckDBPyConnection) -> dict[str, float]:
    """Top-of-page numbers — customers, active rate, churn rate."""
    n_customers = _scalar(con, "select count(*) from customers")
    active_rate = _scalar(
        con,
        "select coalesce(avg(case when status='active' then 1.0 else 0.0 end)*100, 0) "
        "from subscriptions",
    )
    churn_rate = _scalar(
        con, "select coalesce(avg(is_churned)*100, 0) from churn_features"
    )
    return {
        "customers": int(n_customers),
        "active_rate": round(active_rate, 1),
        "churn_rate": round(churn_rate, 1),
    }


def rfm_distribution(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        select rfm_segment, count(*) as customers, round(avg(monetary_usd), 0) as avg_monetary
        from rfm_segments
        group by rfm_segment
        order by customers desc
        """
    ).fetchdf()


def rfm_scatter(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        select customer_id, recency_days, frequency_events, monetary_usd, rfm_segment
        from rfm_segments
        """
    ).fetchdf()


def churn_by_tier(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        select
          current_plan_tier,
          count(*) as customers,
          round(avg(is_churned)*100, 1) as churn_pct,
          round(avg(events_last_30d), 1) as avg_events_30d
        from churn_features
        group by current_plan_tier
        order by churn_pct desc
        """
    ).fetchdf()


def churn_activity_buckets(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        select
          case
            when recent_to_lifetime_ratio is null then 'no activity'
            when recent_to_lifetime_ratio < 0.3 then '0.0 – 0.3 (slowing)'
            when recent_to_lifetime_ratio < 0.7 then '0.3 – 0.7'
            when recent_to_lifetime_ratio < 1.5 then '0.7 – 1.5 (steady)'
            else '1.5+ (accelerating)'
          end as activity_bucket,
          count(*) as customers,
          round(avg(is_churned)*100, 1) as churn_pct
        from churn_features
        group by activity_bucket
        order by churn_pct desc
        """
    ).fetchdf()


def monthly_signups(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        select date_trunc('month', signup_date) as month, count(*) as signups
        from customers
        group by 1 order by 1
        """
    ).fetchdf()


def monthly_paid_invoice_volume(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        select date_trunc('month', period_start) as month,
               sum(amount_usd) as paid_amount_usd
        from invoices
        where status = 'paid'
        group by 1 order by 1
        """
    ).fetchdf()


def cohort_retention_grid(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        select cohort_month, months_since_signup, retention_pct
        from cohort_retention
        order by cohort_month, months_since_signup
        """
    ).fetchdf()
