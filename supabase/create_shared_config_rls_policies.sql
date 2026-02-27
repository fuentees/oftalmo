-- Configuração compartilhada global do app (sem storage.objects)
-- Execute este script no SQL Editor do Supabase.
-- Modo recomendado: RLS habilitado com policies simples de SELECT + INSERT.

create table if not exists public.shared_app_config (
  config_key text primary key,
  config_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.shared_app_config enable row level security;

grant select, insert on public.shared_app_config to authenticated;
grant select, insert on public.shared_app_config to anon;

drop policy if exists shared_app_config_select_authenticated on public.shared_app_config;
drop policy if exists shared_app_config_insert_authenticated on public.shared_app_config;
drop policy if exists shared_app_config_update_authenticated on public.shared_app_config;

create policy shared_app_config_select_authenticated
  on public.shared_app_config
  for select
  to public
  using (
    config_key like '__config__:%'
  );

create policy shared_app_config_insert_authenticated
  on public.shared_app_config
  for insert
  to public
  with check (
    config_key like '__config__:%'
  );
