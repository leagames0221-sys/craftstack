{{ config(materialized='view') }}

-- Per-customer × event_type counts. Powers both the upsell mart
-- (premium / advanced feature usage) and the churn mart (support
-- ticket volume, recent activity).

select
    customer_id,
    event_type,
    count(*) as event_count,
    min(event_at) as first_event_at,
    max(event_at) as last_event_at
from {{ ref('stg_events') }}
group by customer_id, event_type
