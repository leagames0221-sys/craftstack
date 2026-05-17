{{ config(materialized='table') }}

-- Upsell propensity feature table. One row per customer currently on a
-- non-enterprise plan (free or pro). Label: upgraded = 1 when the customer
-- has any subscription on a tier strictly higher than their initial plan.
-- Premium / advanced feature events are the engineered upsell signal.

with plan_rank as (
    -- Numeric rank so we can compare tiers (`enterprise` > `pro` > `free`).
    select 'free' as plan, 1 as rank union all
    select 'pro', 2 union all
    select 'enterprise', 3
),

initial_tier as (
    select
        f.customer_id,
        pr.rank as initial_rank
    from {{ ref('int_customer_features') }} f
    join plan_rank pr on f.plan_tier_at_signup = pr.plan
),

max_tier as (
    select
        s.customer_id,
        max(pr.rank) as max_rank
    from {{ ref('stg_subscriptions') }} s
    join plan_rank pr on s.plan_tier = pr.plan
    group by s.customer_id
),

premium_signal as (
    select
        customer_id,
        sum(case when event_type = 'feature_use_premium' then event_count else 0 end) as premium_event_count,
        sum(case when event_type = 'feature_use_advanced' then event_count else 0 end) as advanced_event_count
    from {{ ref('int_event_aggregates') }}
    group by customer_id
)

select
    f.customer_id,
    f.plan_tier_at_signup,
    f.current_plan_tier,
    f.region,
    f.event_count_total,
    coalesce(p.premium_event_count, 0) as premium_event_count,
    coalesce(p.advanced_event_count, 0) as advanced_event_count,
    f.active_days,
    f.lifetime_paid_usd,
    case when mt.max_rank > it.initial_rank then 1 else 0 end as upgraded
from {{ ref('int_customer_features') }} f
join initial_tier it on f.customer_id = it.customer_id
left join max_tier mt on f.customer_id = mt.customer_id
left join premium_signal p on f.customer_id = p.customer_id
where f.plan_tier_at_signup in ('free', 'pro')
