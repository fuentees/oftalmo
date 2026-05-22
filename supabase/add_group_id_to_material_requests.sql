-- Adiciona colunas para agrupamento por pedido e identificação do GVE.
-- Execute no SQL Editor do Supabase.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests'
      and column_name = 'request_group_id'
  ) then
    alter table public.material_requests
      add column request_group_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests'
      and column_name = 'gves_name'
  ) then
    alter table public.material_requests
      add column gves_name text;
  end if;
end $$;

notify pgrst, 'reload schema';
