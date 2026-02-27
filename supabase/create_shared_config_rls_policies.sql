-- Configuração compartilhada global do app (sem storage.objects)
-- Execute este script no SQL Editor do Supabase.
-- Este modo desabilita RLS para evitar bloqueios de salvamento.

create table if not exists public.shared_app_config (
  config_key text primary key,
  config_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.shared_app_config disable row level security;

grant select, insert, update on public.shared_app_config to authenticated;
grant select, insert, update on public.shared_app_config to anon;
