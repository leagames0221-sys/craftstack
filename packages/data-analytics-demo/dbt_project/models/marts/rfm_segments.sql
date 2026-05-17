{{ config(materialized='table') }}

-- RFM segmentation built from event recency, event frequency, and lifetime
-- paid amount. Quintile scores in {1, 2, 3, 4, 5} on each axis; the
-- composite label maps the (R, F, M) triple to a coarse 4-bucket segment.
--
-- Reference window: max(event_at) across all customers (so the data set
-- self-anchors and the mart is reproducible for any synthetic seed).

with reference_point as (
    select max(event_at)::date as as_of_date from {{ ref('stg_events') }}
),

rfm_raw as (
    select
        f.customer_id,
        date_diff(
            'day',
            cast(f.last_event_at as date),
            (select as_of_date from reference_point)
        ) as recency_days,
        f.event_count_total as frequency_events,
        f.lifetime_paid_usd as monetary_usd
    from {{ ref('int_customer_features') }} f
    where f.last_event_at is not null
),

rfm_scored as (
    select
        customer_id,
        recency_days,
        frequency_events,
        monetary_usd,
        -- Recency: lower is better, so reverse the quintile.
        6 - ntile(5) over (order by recency_days) as r_score,
        ntile(5) over (order by frequency_events) as f_score,
        ntile(5) over (order by monetary_usd) as m_score
    from rfm_raw
)

select
    customer_id,
    recency_days,
    frequency_events,
    monetary_usd,
    r_score,
    f_score,
    m_score,
    case
        when r_score >= 4 and f_score >= 4 and m_score >= 4 then 'champions'
        when r_score >= 4 and f_score >= 3 then 'loyal'
        when r_score >= 3 and m_score >= 4 then 'big_spenders'
        when r_score <= 2 and f_score <= 2 then 'at_risk'
        else 'regular'
    end as rfm_segment
from rfm_scored
