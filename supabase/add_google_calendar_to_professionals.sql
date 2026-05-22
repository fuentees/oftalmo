-- Adiciona colunas de integração com Google Calendar à tabela professionals.
-- Execute no SQL Editor do Supabase.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'professionals'
      and column_name = 'google_calendar_refresh_token'
  ) then
    alter table public.professionals
      add column google_calendar_refresh_token text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'professionals'
      and column_name = 'google_calendar_synced_events'
  ) then
    alter table public.professionals
      add column google_calendar_synced_events jsonb default '{}';
  end if;
end $$;

notify pgrst, 'reload schema';
