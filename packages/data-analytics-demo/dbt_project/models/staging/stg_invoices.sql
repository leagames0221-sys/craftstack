{{ config(materialized='view') }}

select
    invoice_id,
    customer_id,
    subscription_id,
    cast(period_start as date) as period_start,
    cast(period_end as date) as period_end,
    amount_usd,
    status
from {{ source('raw', 'invoices') }}
