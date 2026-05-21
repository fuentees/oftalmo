-- Cria a tabela de solicitações de material.
-- Execute no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  quantity numeric not null,
  unit text,
  reason text,
  requested_by text,
  status text not null default 'pendente',
  notes text,
  request_date date default current_date,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_material_requests_status'
  ) then
    create index idx_material_requests_status
      on public.material_requests (status);
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_material_requests_created_at'
  ) then
    create index idx_material_requests_created_at
      on public.material_requests (created_at desc);
  end if;
end $$;

-- Habilita RLS (Row Level Security) igual às outras tabelas do projeto
alter table public.material_requests enable row level security;

-- Política: usuários autenticados podem ler/escrever
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
