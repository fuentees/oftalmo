-- Adiciona coluna available_for_request à tabela materials.
-- Execute no SQL Editor do Supabase.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'available_for_request'
  ) then
    alter table public.materials
      add column available_for_request boolean not null default false;
  end if;
end $$;

-- Permite leitura anônima de materiais disponíveis para solicitação pública
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'materials'
      and policyname = 'materials_anon_read_available'
  ) then
    create policy materials_anon_read_available
      on public.materials
      for select
      to anon
      using (available_for_request = true);
  end if;
end $$;

-- Permite inserção anônima em material_requests (solicitação pública)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'material_requests'
      and policyname = 'material_requests_anon_insert'
  ) then
    create policy material_requests_anon_insert
      on public.material_requests
      for insert
      to anon
      with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
