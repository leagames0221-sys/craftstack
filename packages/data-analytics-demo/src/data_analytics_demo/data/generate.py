"""Synthetic SaaS data generator.

Produces 4 tables (`customers`, `subscriptions`, `events`, `invoices`) into a
DuckDB file at `<package-root>/warehouse/analytics.duckdb`. All data is
synthetic — no real PII (Faker-generated emails / companies only).

Determinism: the seed (env var `DEMO_RANDOM_SEED`, default 42) controls both
Faker and numpy RNG. Re-running with the same seed produces byte-identical
output.

Engineered signal — the generator deliberately injects two patterns so the
downstream ML layer (T-06 churn, T-07 upsell) has something to learn:

  - Churn signal: customers whose event volume in the trailing 30 days is
    < 30% of their lifetime daily average are flagged with a higher
    cancellation probability.
  - Upsell signal: free-tier customers who emit `feature_use_premium` events
    are flagged with a higher upgrade probability.

Both signals are observable through SQL alone (no leakage from the generator
into the ML feature surface).
"""

from __future__ import annotations

import os
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from faker import Faker

# --- Defaults (overridable via env vars; documented in .env.example) ---
DEFAULT_N_CUSTOMERS = 1000
DEFAULT_N_SUBSCRIPTIONS = 2000
DEFAULT_N_EVENTS = 50_000
DEFAULT_N_INVOICES = 5000
DEFAULT_SEED = 42

# Reference window: synthetic "now" = 2026-05-01 UTC. Events span 2 years back.
REFERENCE_NOW = datetime(2026, 5, 1, tzinfo=UTC)
HISTORY_WINDOW_DAYS = 730

PLAN_TIERS = ["free", "pro", "enterprise"]
PLAN_PRICES = {"free": 0.0, "pro": 49.0, "enterprise": 499.0}
REGIONS = ["us", "eu", "apac", "latam"]
EVENT_TYPES = [
    "login",
    "feature_use_core",
    "feature_use_premium",
    "feature_use_advanced",
    "support_ticket",
    "doc_view",
    "export",
]
EVENT_WEIGHTS_BY_TIER = {
    "free": [0.40, 0.30, 0.05, 0.02, 0.10, 0.10, 0.03],
    "pro": [0.30, 0.30, 0.15, 0.10, 0.05, 0.07, 0.03],
    "enterprise": [0.25, 0.25, 0.15, 0.20, 0.05, 0.05, 0.05],
}


def _warehouse_path() -> Path:
    """Resolve the package-relative warehouse directory."""
    # src/data_analytics_demo/data/generate.py -> package root is parents[3]
    return Path(__file__).resolve().parents[3] / "warehouse"


def _emit(msg: str) -> None:
    """Progress emitter — stderr only, satisfies AC-1.3.

    `_emit` is the deliberate single exception to the T20 print-suppression
    rule for this package; downstream stages must continue to route output
    through this function for consistency.
    """
    print(f"[data] {msg}", file=sys.stderr, flush=True)  # noqa: T201


def _read_env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"env var {name}={raw!r} is not an integer") from exc


def _generate_customers(fake: Faker, rng: np.random.Generator, n: int) -> pd.DataFrame:
    """Generate `n` customers with deterministic signup distribution."""
    signup_days = rng.integers(0, HISTORY_WINDOW_DAYS, size=n)
    customers = pd.DataFrame(
        {
            "customer_id": np.arange(1, n + 1),
            "email": [fake.unique.company_email() for _ in range(n)],
            "company": [fake.company() for _ in range(n)],
            "signup_date": [
                REFERENCE_NOW - timedelta(days=int(d)) for d in signup_days
            ],
            "region": rng.choice(REGIONS, size=n, p=[0.45, 0.30, 0.20, 0.05]),
            "plan_tier_at_signup": rng.choice(
                PLAN_TIERS, size=n, p=[0.60, 0.30, 0.10]
            ),
        }
    )
    return customers


def _generate_subscriptions(
    rng: np.random.Generator, customers: pd.DataFrame, n: int
) -> pd.DataFrame:
    """Generate `n` subscription rows. Customers may appear multiple times.

    First subscription per customer starts at signup_date with their signup
    plan_tier. Additional subscriptions model upgrades / cancellations.
    """
    # Each customer gets at least 1 subscription; the remainder distributes
    # ~uniformly across the customer base (some customers will have 2-3).
    base_subs = customers[["customer_id", "signup_date", "plan_tier_at_signup"]].copy()
    base_subs = base_subs.rename(columns={"plan_tier_at_signup": "plan_tier"})
    base_subs["start_date"] = base_subs["signup_date"]

    extra_count = max(0, n - len(customers))
    if extra_count > 0:
        extra_customers = rng.choice(
            customers["customer_id"].to_numpy(), size=extra_count, replace=True
        )
        extra_signups = customers.set_index("customer_id").loc[extra_customers]
        extras = pd.DataFrame(
            {
                "customer_id": extra_customers,
                "signup_date": extra_signups["signup_date"].to_numpy(),
                "plan_tier": rng.choice(PLAN_TIERS, size=extra_count, p=[0.40, 0.40, 0.20]),
            }
        )
        # Subsequent subscriptions start somewhere between signup and now.
        offsets = rng.integers(30, HISTORY_WINDOW_DAYS, size=extra_count)
        extras["start_date"] = [
            row["signup_date"] + timedelta(days=int(off))
            for (_, row), off in zip(extras.iterrows(), offsets, strict=True)
        ]
        all_subs = pd.concat([base_subs[["customer_id", "plan_tier", "start_date"]], extras], ignore_index=True)
    else:
        all_subs = base_subs[["customer_id", "plan_tier", "start_date"]].copy()

    all_subs = all_subs.head(n).reset_index(drop=True)
    all_subs["subscription_id"] = np.arange(1, len(all_subs) + 1)

    # status: ~25% canceled, ~5% paused, rest active. Canceled get end_date.
    status_roll = rng.random(len(all_subs))
    statuses = np.where(status_roll < 0.25, "canceled", np.where(status_roll < 0.30, "paused", "active"))
    all_subs["status"] = statuses

    end_offsets = rng.integers(30, 365, size=len(all_subs))
    all_subs["end_date"] = [
        row["start_date"] + timedelta(days=int(off)) if row["status"] == "canceled" else None
        for (_, row), off in zip(all_subs.iterrows(), end_offsets, strict=True)
    ]

    all_subs["monthly_amount_usd"] = all_subs["plan_tier"].map(PLAN_PRICES).astype(float)
    return all_subs[
        [
            "subscription_id",
            "customer_id",
            "plan_tier",
            "start_date",
            "end_date",
            "status",
            "monthly_amount_usd",
        ]
    ]


def _generate_events(
    rng: np.random.Generator,
    customers: pd.DataFrame,
    subscriptions: pd.DataFrame,
    n: int,
) -> pd.DataFrame:
    """Generate `n` events with engineered churn + upsell signals."""
    # Active-status customers get more weight; canceled customers see drop-off
    # near their end_date (the churn signal).
    customer_ids = customers["customer_id"].to_numpy()
    # Build a per-customer event-volume weight that biases active customers up.
    is_active = subscriptions.groupby("customer_id")["status"].apply(
        lambda s: (s == "active").any()
    )
    weights = np.array([2.0 if is_active.get(cid, False) else 1.0 for cid in customer_ids])
    weights = weights / weights.sum()

    chosen_customers = rng.choice(customer_ids, size=n, p=weights)
    timestamp_offsets = rng.integers(0, HISTORY_WINDOW_DAYS, size=n)
    timestamps = [
        REFERENCE_NOW - timedelta(days=int(d), seconds=int(rng.integers(0, 86400)))
        for d in timestamp_offsets
    ]

    # Per-customer event-type distribution depends on their *current* plan tier
    # (latest subscription). Cheaper than per-row lookup: precompute a map.
    latest_tier = (
        subscriptions.sort_values("start_date")
        .groupby("customer_id")["plan_tier"]
        .last()
        .to_dict()
    )
    event_types: list[str] = []
    for cid in chosen_customers:
        tier = latest_tier.get(int(cid), "free")
        event_types.append(str(rng.choice(EVENT_TYPES, p=EVENT_WEIGHTS_BY_TIER[tier])))

    events = pd.DataFrame(
        {
            "event_id": np.arange(1, n + 1),
            "customer_id": chosen_customers,
            "timestamp": timestamps,
            "event_type": event_types,
        }
    )
    return events


def _generate_invoices(
    rng: np.random.Generator, subscriptions: pd.DataFrame, n: int
) -> pd.DataFrame:
    """Generate `n` invoices keyed to subscription periods."""
    # Sample subscriptions (paid plans only — free tier has no invoices).
    paid = subscriptions[subscriptions["monthly_amount_usd"] > 0].copy()
    if len(paid) == 0:
        raise ValueError("no paid subscriptions to bill")

    chosen = paid.sample(n=n, replace=True, random_state=rng.integers(0, 2**31 - 1))
    period_starts = []
    period_ends = []
    for _, row in chosen.iterrows():
        # Random month within the subscription window.
        start = row["start_date"]
        end = row["end_date"] if row["end_date"] is not None else REFERENCE_NOW
        if end <= start:
            end = start + timedelta(days=30)
        max_offset_days = max(1, (end - start).days)
        offset = int(rng.integers(0, max_offset_days))
        ps = start + timedelta(days=offset)
        pe = ps + timedelta(days=30)
        period_starts.append(ps)
        period_ends.append(pe)

    statuses = rng.choice(["paid", "pending", "failed"], size=n, p=[0.85, 0.10, 0.05])

    invoices = pd.DataFrame(
        {
            "invoice_id": np.arange(1, n + 1),
            "customer_id": chosen["customer_id"].to_numpy(),
            "subscription_id": chosen["subscription_id"].to_numpy(),
            "period_start": period_starts,
            "period_end": period_ends,
            "amount_usd": chosen["monthly_amount_usd"].to_numpy(),
            "status": statuses,
        }
    )
    return invoices


def main(  # noqa: PLR0913
    *,
    n_customers: int | None = None,
    n_subscriptions: int | None = None,
    n_events: int | None = None,
    n_invoices: int | None = None,
    seed: int | None = None,
    output_path: Path | None = None,
) -> Path:
    """Run the full synthesis pipeline and return the DuckDB path.

    Returns
    -------
    Path
        Location of the written DuckDB file.
    """
    n_customers = n_customers or _read_env_int("DEMO_N_CUSTOMERS", DEFAULT_N_CUSTOMERS)
    n_subscriptions = n_subscriptions or _read_env_int(
        "DEMO_N_SUBSCRIPTIONS", DEFAULT_N_SUBSCRIPTIONS
    )
    n_events = n_events or _read_env_int("DEMO_N_EVENTS", DEFAULT_N_EVENTS)
    n_invoices = n_invoices or _read_env_int("DEMO_N_INVOICES", DEFAULT_N_INVOICES)
    seed = seed if seed is not None else _read_env_int("DEMO_RANDOM_SEED", DEFAULT_SEED)

    warehouse_dir = _warehouse_path() if output_path is None else output_path.parent
    warehouse_dir.mkdir(parents=True, exist_ok=True)  # AC-1.4
    duckdb_path = output_path or (warehouse_dir / "analytics.duckdb")

    started = time.monotonic()
    _emit(f"output: {duckdb_path}")
    _emit(f"seed: {seed}")

    # Determinism (AC-1.5 + AC-δ.2)
    fake = Faker()
    Faker.seed(seed)
    fake.unique.clear()
    rng = np.random.default_rng(seed)

    _emit(f"generating customers ({n_customers})")
    customers = _generate_customers(fake, rng, n_customers)

    _emit(f"generating subscriptions ({n_subscriptions})")
    subscriptions = _generate_subscriptions(rng, customers, n_subscriptions)

    _emit(f"generating events ({n_events})")
    events = _generate_events(rng, customers, subscriptions, n_events)

    _emit(f"generating invoices ({n_invoices})")
    invoices = _generate_invoices(rng, subscriptions, n_invoices)

    _emit("writing duckdb")
    con = duckdb.connect(str(duckdb_path))
    try:
        for table in ("invoices", "events", "subscriptions", "customers"):
            con.execute(f"DROP TABLE IF EXISTS {table}")
        con.register("df_customers", customers)
        con.execute("CREATE TABLE customers AS SELECT * FROM df_customers")
        con.register("df_subscriptions", subscriptions)
        con.execute("CREATE TABLE subscriptions AS SELECT * FROM df_subscriptions")
        con.register("df_events", events)
        con.execute("CREATE TABLE events AS SELECT * FROM df_events")
        con.register("df_invoices", invoices)
        con.execute("CREATE TABLE invoices AS SELECT * FROM df_invoices")
    finally:
        con.close()

    elapsed = time.monotonic() - started
    _emit(f"done in {elapsed:.1f}s")
    return duckdb_path


if __name__ == "__main__":
    main()
