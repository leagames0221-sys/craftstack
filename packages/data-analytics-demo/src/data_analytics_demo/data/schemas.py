"""Pydantic schemas for the 4 synthetic SaaS tables.

These define the contract between the generator (this package) and the dbt
staging layer (`dbt_project/models/staging/`). They are deliberately small,
typed, and free of cross-package import — dbt consumes them only by column
shape, not as a Python import.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

PlanTier = Literal["free", "pro", "enterprise"]
Region = Literal["us", "eu", "apac", "latam"]
SubscriptionStatus = Literal["active", "canceled", "paused"]
InvoiceStatus = Literal["paid", "pending", "failed"]
EventType = Literal[
    "login",
    "feature_use_core",
    "feature_use_premium",
    "feature_use_advanced",
    "support_ticket",
    "doc_view",
    "export",
]


class Customer(BaseModel):
    """A single tenant on the SaaS product."""

    customer_id: int = Field(ge=1)
    email: EmailStr
    company: str
    signup_date: datetime
    region: Region
    plan_tier_at_signup: PlanTier


class Subscription(BaseModel):
    """A subscription contract owned by a customer.

    A customer may have multiple subscription rows over time (upgrades,
    cancellations, re-subscriptions). Cohort retention queries (AC-2.1) read
    from this table.
    """

    subscription_id: int = Field(ge=1)
    customer_id: int = Field(ge=1)
    plan_tier: PlanTier
    start_date: datetime
    end_date: datetime | None  # None for active subscriptions
    status: SubscriptionStatus
    monthly_amount_usd: float = Field(ge=0)


class Event(BaseModel):
    """A product-usage event emitted by a customer.

    Volume drives both the churn signal (drop-off in last 30 days) and the
    upsell signal (premium-feature usage by free-tier customers).
    """

    event_id: int = Field(ge=1)
    customer_id: int = Field(ge=1)
    timestamp: datetime
    event_type: EventType


class Invoice(BaseModel):
    """A monthly invoice tied to a subscription period."""

    invoice_id: int = Field(ge=1)
    customer_id: int = Field(ge=1)
    subscription_id: int = Field(ge=1)
    period_start: datetime
    period_end: datetime
    amount_usd: float = Field(ge=0)
    status: InvoiceStatus
