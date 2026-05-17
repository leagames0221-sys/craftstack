{{ config(materialized='view') }}

select
    subscription_id,
    customer_id,
    plan_tier,
    cast(start_date as date) as start_date,
    cast(end_date as date) as end_date,
    status,
    monthly_amount_usd
from {{ source('raw', 'subscriptions') }}
