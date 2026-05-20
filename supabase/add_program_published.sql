-- Adiciona campo para controlar visibilidade da programação na inscrição pública
alter table trainings add column if not exists program_published boolean default false;
