-- Políticas RLS para configurações compartilhadas do app
-- Execute este script no SQL Editor do Supabase.
--
-- Objetivo:
-- 1) Permitir salvar/ler configurações globais no fallback em training_materials
--    (chaves com prefixo "__config__:")
--
-- Observação:
-- Em alguns projetos, o usuário do SQL Editor não é owner de storage.objects.
-- Por isso, este script NÃO altera policies do Storage.
-- O app já funciona com fallback compartilhado em training_materials.

alter table public.training_materials enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_materials'
      and policyname = 'tm_shared_config_select_authenticated'
  ) then
    create policy tm_shared_config_select_authenticated
      on public.training_materials
      for select
      to authenticated
      using (
        auth.role() = 'authenticated'
        and name like '__config__:%'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_materials'
      and policyname = 'tm_shared_config_insert_authenticated'
  ) then
    create policy tm_shared_config_insert_authenticated
      on public.training_materials
      for insert
      to authenticated
      with check (
        auth.role() = 'authenticated'
        and name like '__config__:%'
      );
  end if;
end $$;
