-- Cria ou atualiza a tabela de solicitações de material.
-- Execute no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

do $$
begin
  -- item_name
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'item_name'
  ) then
    alter table public.material_requests add column item_name text;
  end if;

  -- quantity
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'quantity'
  ) then
    alter table public.material_requests add column quantity numeric;
  end if;

  -- unit
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'unit'
  ) then
    alter table public.material_requests add column unit text;
  end if;

  -- reason
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'reason'
  ) then
    alter table public.material_requests add column reason text;
  end if;

  -- requested_by
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'requested_by'
  ) then
    alter table public.material_requests add column requested_by text;
  end if;

  -- status
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'status'
  ) then
    alter table public.material_requests add column status text not null default 'pendente';
  end if;

  -- notes
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'notes'
  ) then
    alter table public.material_requests add column notes text;
  end if;

  -- request_date
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_requests' and column_name = 'request_date'
  ) then
    alter table public.material_requests add column request_date date default current_date;
  end if;

  -- índices
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_material_requests_status'
  ) then
    create index idx_material_requests_status on public.material_requests (status);
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_material_requests_created_at'
  ) then
    create index idx_material_requests_created_at on public.material_requests (created_at desc);
  end if;
end $$;

-- Habilita RLS igual às outras tabelas do projeto
alter table public.material_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'material_requests'
      and policyname = 'material_requests_authenticated'
  ) then
    create policy material_requests_authenticated
      on public.material_requests
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
