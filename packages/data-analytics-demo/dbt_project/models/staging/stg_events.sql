{{ config(materialized='view') }}

select
    event_id,
    customer_id,
    cast(timestamp as timestamp) as event_at,
    event_type
from {{ source('raw', 'events') }}
