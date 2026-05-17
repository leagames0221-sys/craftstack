{{ config(materialized='view') }}

select
    customer_id,
    email,
    company,
    cast(signup_date as date) as signup_date,
    region,
    plan_tier_at_signup
from {{ source('raw', 'customers') }}
