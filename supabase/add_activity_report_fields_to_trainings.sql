-- Campos usados no Relatório de Atividades do CVE (Centro de Vigilância
-- Epidemiológica), que não têm correspondência automática com nenhum outro
-- dado já cadastrado no treinamento.
-- Execute no SQL Editor do Supabase.

alter table public.trainings
  add column if not exists meta_pes text,
  add column if not exists disease_or_event text,
  add column if not exists action_nature text,
  add column if not exists target_audience text;

notify pgrst, 'reload schema';
