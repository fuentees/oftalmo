-- Cria/atualiza a tabela de mensagens do canal de comunicação.
-- Execute no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text,
  sender_email text,
  recipient_scope text default 'todos',
  recipient_label text,
  subject text,
  message text not null,
  seen_by jsonb default '[]'::jsonb,
  seen_at timestamptz,
  confirmed boolean default false,
  confirmed_at timestamptz,
  confirmed_by text,
  is_archived boolean default false,
  archived_at timestamptz,
  archived_by text,
  edited_at timestamptz,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'seen_by'
  ) then
    alter table public.communication_messages
      add column seen_by jsonb default '[]'::jsonb;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'seen_at'
  ) then
    alter table public.communication_messages
      add column seen_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'confirmed'
  ) then
    alter table public.communication_messages
      add column confirmed boolean default false;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'confirmed_at'
  ) then
    alter table public.communication_messages
      add column confirmed_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'confirmed_by'
  ) then
    alter table public.communication_messages
      add column confirmed_by text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'is_archived'
  ) then
    alter table public.communication_messages
      add column is_archived boolean default false;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'archived_at'
  ) then
    alter table public.communication_messages
      add column archived_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'archived_by'
  ) then
    alter table public.communication_messages
      add column archived_by text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communication_messages'
      and column_name = 'edited_at'
  ) then
    alter table public.communication_messages
      add column edited_at timestamptz;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_communication_messages_created_at'
  ) then
    create index idx_communication_messages_created_at
      on public.communication_messages (created_at desc);
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_communication_messages_archived_created_at'
  ) then
    create index idx_communication_messages_archived_created_at
      on public.communication_messages (is_archived, created_at desc);
  end if;
end $$;

notify pgrst, 'reload schema';
