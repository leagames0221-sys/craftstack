{{ config(materialized='view') }}

-- Per-customer base features built once and reused by all mart models.
-- Joins customers + their lifetime event activity + total monetary value.

with customer_event_stats as (
    select
        customer_id,
        count(*) as event_count_total,
        count(distinct event_type) as distinct_event_types,
        min(event_at) as first_event_at,
        max(event_at) as last_event_at,
        date_diff('day', min(event_at), max(event_at)) + 1 as active_days
    from {{ ref('stg_events') }}
    group by customer_id
),

customer_invoice_stats as (
    select
        customer_id,
        sum(case when status = 'paid' then amount_usd else 0 end) as lifetime_paid_usd,
        sum(case when status = 'failed' then 1 else 0 end) as failed_invoice_count,
        count(*) as invoice_count
    from {{ ref('stg_invoices') }}
    group by customer_id
),

latest_subscription as (
    select
        customer_id,
        plan_tier as current_plan_tier,
        status as current_status,
        row_number() over (partition by customer_id order by start_date desc) as rn
    from {{ ref('stg_subscriptions') }}
    qualify rn = 1
)

select
    c.customer_id,
    c.email,
    c.company,
    c.signup_date,
    c.region,
    c.plan_tier_at_signup,
    coalesce(ls.current_plan_tier, c.plan_tier_at_signup) as current_plan_tier,
    coalesce(ls.current_status, 'unknown') as current_status,
    coalesce(ces.event_count_total, 0) as event_count_total,
    coalesce(ces.distinct_event_types, 0) as distinct_event_types,
    ces.first_event_at,
    ces.last_event_at,
    coalesce(ces.active_days, 0) as active_days,
    coalesce(cis.lifetime_paid_usd, 0) as lifetime_paid_usd,
    coalesce(cis.failed_invoice_count, 0) as failed_invoice_count,
    coalesce(cis.invoice_count, 0) as invoice_count
from {{ ref('stg_customers') }} c
left join customer_event_stats ces on c.customer_id = ces.customer_id
left join customer_invoice_stats cis on c.customer_id = cis.customer_id
left join latest_subscription ls on c.customer_id = ls.customer_id
