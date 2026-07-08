alter table public.training_participants
  add column if not exists certificate_number text,
  add column if not exists certificate_issue_metadata jsonb;

create unique index if not exists training_participants_certificate_number_key
  on public.training_participants (certificate_number)
  where certificate_number is not null;
