{{ config(materialized='table') }}

-- Churn-prediction feature table. One row per customer.
-- Label: is_churned = 1 when the customer's latest subscription is canceled.
-- Feature engineering deliberately mirrors the synthetic-data churn signal
-- (trailing-30d event drop-off vs lifetime daily average).

with reference_point as (
    select max(event_at)::date as as_of_date from {{ ref('stg_events') }}
),

trailing_30d as (
    select
        e.customer_id,
        count(*) as events_last_30d
    from {{ ref('stg_events') }} e
    cross join reference_point r
    where e.event_at >= r.as_of_date - interval 30 day
    group by e.customer_id
),

support_volume as (
    select
        customer_id,
        sum(event_count) as support_ticket_count
    from {{ ref('int_event_aggregates') }}
    where event_type = 'support_ticket'
    group by customer_id
)

select
    f.customer_id,
    f.plan_tier_at_signup,
    f.current_plan_tier,
    f.region,
    f.event_count_total,
    f.distinct_event_types,
    f.lifetime_paid_usd,
    f.failed_invoice_count,
    f.invoice_count,
    coalesce(t.events_last_30d, 0) as events_last_30d,
    -- Daily lifetime average; guards against divide-by-zero with NULLIF.
    f.event_count_total::double / NULLIF(f.active_days, 0) as lifetime_daily_avg_events,
    -- Trailing-30d rate vs lifetime daily avg. < 1.0 means slowing down.
    case
        when f.active_days > 0 and f.event_count_total > 0
        then (coalesce(t.events_last_30d, 0) / 30.0)
             / (f.event_count_total::double / f.active_days)
        else null
    end as recent_to_lifetime_ratio,
    coalesce(s.support_ticket_count, 0) as support_ticket_count,
    case when f.current_status = 'canceled' then 1 else 0 end as is_churned
from {{ ref('int_customer_features') }} f
left join trailing_30d t on f.customer_id = t.customer_id
left join support_volume s on f.customer_id = s.customer_id
