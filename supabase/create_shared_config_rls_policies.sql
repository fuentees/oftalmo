-- Políticas RLS para configurações compartilhadas do app
-- Execute este script no SQL Editor do Supabase.
--
-- Objetivo:
-- 1) Permitir salvar/ler configurações globais no fallback em training_materials
--    (chaves com prefixo "__config__:")
-- 2) Permitir salvar/ler arquivos em "certificates/*" no Storage (bucket uploads)
--
-- Se seu bucket de uploads tiver outro nome, ajuste bucket_id = 'uploads'.

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
        and training_id is null
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
        and training_id is null
        and name like '__config__:%'
      );
  end if;
end $$;

alter table storage.objects enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_certificates_select_authenticated'
  ) then
    create policy storage_certificates_select_authenticated
      on storage.objects
      for select
      to authenticated
      using (
        auth.role() = 'authenticated'
        and bucket_id = 'uploads'
        and name like 'certificates/%'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_certificates_insert_authenticated'
  ) then
    create policy storage_certificates_insert_authenticated
      on storage.objects
      for insert
      to authenticated
      with check (
        auth.role() = 'authenticated'
        and bucket_id = 'uploads'
        and name like 'certificates/%'
      );
  end if;
end $$;
