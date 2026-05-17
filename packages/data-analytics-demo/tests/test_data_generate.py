"""Tests for the synthetic data generator (T-03 / AC-1.x)."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

from data_analytics_demo.data import generate
from data_analytics_demo.data.schemas import Customer, Event, Invoice, Subscription


@pytest.fixture()
def small_warehouse(tmp_path: Path) -> Path:
    """Generate a small but representative dataset into a temp DuckDB file."""
    out = tmp_path / "analytics.duckdb"
    generate.main(
        n_customers=200,
        n_subscriptions=400,
        n_events=2_000,
        n_invoices=600,
        seed=42,
        output_path=out,
    )
    return out


# ---- AC-1.1 ----------------------------------------------------------------

def test_ac_1_1_four_tables_present(small_warehouse: Path) -> None:
    con = duckdb.connect(str(small_warehouse), read_only=True)
    try:
        tables = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
    finally:
        con.close()
    assert tables == {"customers", "subscriptions", "events", "invoices"}


# ---- AC-1.2 (proportional minimums verified at production sizing) ----------

def test_ac_1_2_row_counts_match_request(small_warehouse: Path) -> None:
    con = duckdb.connect(str(small_warehouse), read_only=True)
    try:
        counts = {
            t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("customers", "subscriptions", "events", "invoices")
        }
    finally:
        con.close()
    assert counts["customers"] == 200
    assert counts["subscriptions"] == 400
    assert counts["events"] == 2_000
    assert counts["invoices"] == 600


def test_ac_1_2_default_sizing_meets_floor(tmp_path: Path) -> None:
    """At default sizing, row counts meet the AC-1.2 floor."""
    out = tmp_path / "analytics.duckdb"
    generate.main(output_path=out, seed=42)
    con = duckdb.connect(str(out), read_only=True)
    try:
        n_customers = con.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        n_events = con.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        n_subscriptions = con.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]
        n_invoices = con.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
    finally:
        con.close()
    assert n_customers >= 1_000
    assert n_events >= 50_000
    assert n_subscriptions >= 2_000
    assert n_invoices >= 5_000


# ---- AC-1.3 (progress to stderr) -------------------------------------------

def test_ac_1_3_emits_progress(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    out = tmp_path / "analytics.duckdb"
    generate.main(
        n_customers=100, n_subscriptions=200, n_events=500, n_invoices=300, seed=1, output_path=out
    )
    captured = capsys.readouterr()
    # Progress emits via _emit() -> stderr with a [data] prefix
    assert "[data]" in captured.err
    assert "customers" in captured.err
    assert "done" in captured.err


# ---- AC-1.4 (auto-create warehouse dir) ------------------------------------

def test_ac_1_4_creates_missing_warehouse_dir(tmp_path: Path) -> None:
    nested = tmp_path / "nope" / "deeper" / "analytics.duckdb"
    assert not nested.parent.exists()
    generate.main(
        n_customers=50, n_subscriptions=100, n_events=200, n_invoices=120, seed=2, output_path=nested
    )
    assert nested.exists()


# ---- AC-1.5 / AC-δ.2 (determinism) -----------------------------------------

def test_ac_1_5_deterministic_with_same_seed(tmp_path: Path) -> None:
    a = tmp_path / "a.duckdb"
    b = tmp_path / "b.duckdb"
    generate.main(
        n_customers=100, n_subscriptions=200, n_events=500, n_invoices=300, seed=7, output_path=a
    )
    generate.main(
        n_customers=100, n_subscriptions=200, n_events=500, n_invoices=300, seed=7, output_path=b
    )

    def read_all(p: Path) -> dict[str, list[tuple]]:
        con = duckdb.connect(str(p), read_only=True)
        try:
            return {
                t: con.execute(f"SELECT * FROM {t} ORDER BY 1").fetchall()
                for t in ("customers", "subscriptions", "events", "invoices")
            }
        finally:
            con.close()

    assert read_all(a) == read_all(b)


# ---- AC-γ.1 (no real PII) --------------------------------------------------

def test_ac_gamma_1_no_real_pii_signature(small_warehouse: Path) -> None:
    """Sanity check: emails follow the Faker company-email pattern (not gmail/etc.)."""
    con = duckdb.connect(str(small_warehouse), read_only=True)
    try:
        sample_emails = [
            row[0] for row in con.execute("SELECT email FROM customers LIMIT 50").fetchall()
        ]
    finally:
        con.close()
    common_real_domains = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"}
    for email in sample_emails:
        domain = email.split("@", 1)[1].lower()
        assert domain not in common_real_domains, f"unexpected real-domain email: {email}"


# ---- Schema round-trip (extra sanity) --------------------------------------

def test_schemas_validate_first_row(small_warehouse: Path) -> None:
    """Each table's first row deserializes into its Pydantic schema."""
    con = duckdb.connect(str(small_warehouse), read_only=True)
    try:
        cust_row = con.execute("SELECT * FROM customers LIMIT 1").fetchdf().iloc[0].to_dict()
        sub_row = con.execute("SELECT * FROM subscriptions LIMIT 1").fetchdf().iloc[0].to_dict()
        evt_row = con.execute("SELECT * FROM events LIMIT 1").fetchdf().iloc[0].to_dict()
        inv_row = con.execute("SELECT * FROM invoices LIMIT 1").fetchdf().iloc[0].to_dict()
    finally:
        con.close()

    # Pydantic accepts pandas/numpy datetimes; allow lenient parsing.
    Customer.model_validate(cust_row)
    Subscription.model_validate(sub_row)
    Event.model_validate(evt_row)
    Invoice.model_validate(inv_row)
