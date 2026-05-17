{{ config(materialized='table') }}

-- Monthly signup cohort × months-since-signup retention grid.
-- "Active" at offset M = the customer emitted at least one event in the
-- month starting M months after signup. Cohort size is the count of
-- customers in the signup month.

with customer_signup as (
    select
        customer_id,
        date_trunc('month', signup_date) as cohort_month
    from {{ ref('stg_customers') }}
),

monthly_activity as (
    select distinct
        customer_id,
        date_trunc('month', event_at) as active_month
    from {{ ref('stg_events') }}
),

cohort_offsets as (
    select
        c.cohort_month,
        c.customer_id,
        date_diff('month', c.cohort_month, m.active_month) as months_since_signup
    from customer_signup c
    join monthly_activity m on c.customer_id = m.customer_id
    where m.active_month >= c.cohort_month
),

cohort_sizes as (
    select cohort_month, count(distinct customer_id) as cohort_size
    from customer_signup
    group by cohort_month
)

select
    o.cohort_month,
    cs.cohort_size,
    o.months_since_signup,
    count(distinct o.customer_id) as active_customers,
    round(count(distinct o.customer_id) * 100.0 / cs.cohort_size, 2) as retention_pct
from cohort_offsets o
join cohort_sizes cs on o.cohort_month = cs.cohort_month
group by o.cohort_month, cs.cohort_size, o.months_since_signup
order by o.cohort_month, o.months_since_signup
