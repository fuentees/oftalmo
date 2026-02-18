-- Cria/atualiza a tabela de perguntas de avaliacao e recarrega o schema cache.
-- Execute no SQL Editor do Supabase quando aparecer:
-- "Could not find the table 'public.training_feedback_questions' in the schema cache"

create extension if not exists pgcrypto;

create table if not exists public.training_feedback_questions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete cascade,
  question_text text not null,
  question_type text default 'rating',
  required boolean default true,
  "order" integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_training_feedback_questions_training_order'
  ) then
    create index idx_training_feedback_questions_training_order
      on public.training_feedback_questions (training_id, "order");
  end if;
end $$;

-- Recarrega o schema cache do PostgREST (API do Supabase).
notify pgrst, 'reload schema';
