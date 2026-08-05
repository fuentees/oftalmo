-- Complementa add_activity_report_fields_to_trainings.sql: dois campos que
-- eram inferidos (Tipo de evento / Promovido pela Divisão-GVE) agora são
-- informados explicitamente, para bater com a definição oficial do
-- Relatório de Atividades do CVE.
-- Execute no SQL Editor do Supabase.

alter table public.trainings
  add column if not exists event_format text,
  add column if not exists promoted_by_division text;

notify pgrst, 'reload schema';
