-- Coordenador ja tinha nome/email/professional_id, mas nunca teve RG/CPF —
-- por isso o certificado de coordenador sempre saia com documento em branco.
-- Monitor/palestrante ja tem RG/CPF guardados dentro do jsonb (monitors/speakers),
-- entao so o coordenador precisa de colunas novas.
-- Execute no SQL Editor do Supabase.

alter table public.trainings
  add column if not exists coordinator_rg text,
  add column if not exists coordinator_cpf text;

notify pgrst, 'reload schema';
