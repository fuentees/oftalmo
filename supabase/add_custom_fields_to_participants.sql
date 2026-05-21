alter table public.training_participants
  add column if not exists custom_fields jsonb;
