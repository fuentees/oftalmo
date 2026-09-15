-- Adiciona a coluna "answers" na tabela de avaliações e recarrega o schema cache.
-- Execute no SQL Editor do Supabase quando aparecer:
-- "Could not find the 'answers' column of 'training_feedback' in the schema cache"

alter table if exists public.training_feedback
  add column if not exists answers jsonb;

-- Recarrega o schema cache do PostgREST (API do Supabase).
notify pgrst, 'reload schema';
