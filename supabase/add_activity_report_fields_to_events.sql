-- Campos do Relatório de Atividades do CVE também para eventos da Agenda
-- (além dos treinamentos), seguindo o mesmo padrão criado em
-- add_activity_report_fields_to_trainings.sql. Um evento só entra no
-- relatório se include_in_activity_report = true (opt-in explícito — evita
-- que férias, viagens pessoais etc. apareçam por engano num relatório oficial).
-- Execute no SQL Editor do Supabase.

alter table public.events
  add column if not exists meta_pes text,
  add column if not exists disease_or_event text,
  add column if not exists action_nature text,
  add column if not exists target_audience text,
  add column if not exists event_format text,
  add column if not exists promoted_by_division text,
  add column if not exists include_in_activity_report boolean not null default false;

notify pgrst, 'reload schema';
