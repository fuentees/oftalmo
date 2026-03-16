-- One-off orphan cleanup for legacy participant rows.
-- Run in Supabase SQL Editor.

-- 1) Preview orphan rows that would be removed.
with training_date_keys as (
  select
    t.id,
    lower(trim(coalesce(t.title, ''))) as title_key,
    t.date as date_key
  from public.trainings t
  union all
  select
    t.id,
    lower(trim(coalesce(t.title, ''))) as title_key,
    nullif(item ->> 'date', '')::date as date_key
  from public.trainings t
  cross join lateral jsonb_array_elements(coalesce(t.dates, '[]'::jsonb)) as item
  where nullif(item ->> 'date', '') is not null
),
orphan_participants as (
  select tp.*
  from public.training_participants tp
  where
    (
      tp.training_id is not null
      and not exists (
        select 1
        from public.trainings t
        where t.id = tp.training_id
      )
    )
    or (
      tp.training_id is null
      and not exists (
        select 1
        from training_date_keys k
        where
          k.title_key = lower(trim(coalesce(tp.training_title, '')))
          and (
            tp.training_date is null
            or k.date_key is null
            or k.date_key = tp.training_date
          )
      )
    )
)
select *
from orphan_participants
order by created_at desc;

-- 2) Delete the same orphan rows.
with training_date_keys as (
  select
    t.id,
    lower(trim(coalesce(t.title, ''))) as title_key,
    t.date as date_key
  from public.trainings t
  union all
  select
    t.id,
    lower(trim(coalesce(t.title, ''))) as title_key,
    nullif(item ->> 'date', '')::date as date_key
  from public.trainings t
  cross join lateral jsonb_array_elements(coalesce(t.dates, '[]'::jsonb)) as item
  where nullif(item ->> 'date', '') is not null
),
orphan_ids as (
  select tp.id
  from public.training_participants tp
  where
    (
      tp.training_id is not null
      and not exists (
        select 1
        from public.trainings t
        where t.id = tp.training_id
      )
    )
    or (
      tp.training_id is null
      and not exists (
        select 1
        from training_date_keys k
        where
          k.title_key = lower(trim(coalesce(tp.training_title, '')))
          and (
            tp.training_date is null
            or k.date_key is null
            or k.date_key = tp.training_date
          )
      )
    )
)
delete from public.training_participants tp
using orphan_ids
where tp.id = orphan_ids.id;
