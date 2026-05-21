alter table public.enrollment_fields
  add column if not exists options jsonb;
