-- Padroniza o coordenador do treinamento com o cadastro de Profissionais,
-- da mesma forma que monitores e palestrantes passam a ter professional_id
-- (esses ja sao jsonb, nao precisam de coluna nova).
-- Execute no SQL Editor do Supabase.

alter table public.trainings
  add column if not exists coordinator_professional_id uuid references public.professionals(id) on delete set null;

create index if not exists idx_trainings_coordinator_professional
  on public.trainings (coordinator_professional_id);

notify pgrst, 'reload schema';
