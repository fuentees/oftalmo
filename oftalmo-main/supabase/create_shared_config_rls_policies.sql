-- Configuração compartilhada global do app (sem storage.objects)
-- Execute este script no SQL Editor do Supabase.
-- Modo de emergência: remove bloqueios de RLS para shared_app_config
-- e para o fallback em training_materials.

create table if not exists public.shared_app_config (
  config_key text primary key,
  config_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.shared_app_config disable row level security;
grant select, insert, update, delete on public.shared_app_config to authenticated;
grant select, insert, update, delete on public.shared_app_config to anon;

-- Fallback usado pelo app quando shared_app_config falhar por policy.
alter table public.training_materials disable row level security;
grant select, insert, update, delete on public.training_materials to authenticated;
grant select, insert, update, delete on public.training_materials to anon;
