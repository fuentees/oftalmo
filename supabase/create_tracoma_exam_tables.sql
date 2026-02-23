-- Cria tabelas do módulo:
-- "Avaliação de Examinadores de tracoma – Teste de 50 Questões"
-- e carrega o gabarito padrão ouro (50 respostas binárias).

create extension if not exists pgcrypto;

create table if not exists public.tracoma_exam_answer_keys (
  id uuid primary key default gen_random_uuid(),
  question_number integer not null unique,
  expected_answer smallint not null check (expected_answer in (0, 1)),
  answer_key_code text not null default 'TF_PADRAO_OURO_V1',
  is_locked boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (question_number between 1 and 50)
);

create table if not exists public.tracoma_exam_results (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete set null,
  training_title text,
  participant_name text not null,
  participant_email text,
  participant_cpf text,
  total_questions integer not null default 50,
  total_matches integer not null default 0,
  matrix_a integer not null default 0,
  matrix_b integer not null default 0,
  matrix_c integer not null default 0,
  matrix_d integer not null default 0,
  observed_agreement numeric(8, 6),
  expected_agreement numeric(8, 6),
  kappa numeric(8, 6),
  kappa_ci_low numeric(8, 6),
  kappa_ci_high numeric(8, 6),
  sensitivity numeric(8, 6),
  specificity numeric(8, 6),
  interpretation text,
  aptitude_status text,
  answer_key_code text default 'TF_PADRAO_OURO_V1',
  answers jsonb not null,
  created_at timestamptz default now(),
  check (total_questions > 0)
);

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_tracoma_exam_results_training_created_at'
  ) then
    create index idx_tracoma_exam_results_training_created_at
      on public.tracoma_exam_results (training_id, created_at desc);
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_tracoma_exam_results_participant_name'
  ) then
    create index idx_tracoma_exam_results_participant_name
      on public.tracoma_exam_results (participant_name);
  end if;
end $$;

-- Gabarito padrão ouro (0/1) para 50 questões.
-- Este bloco insere o gabarito apenas se a questão ainda não existir.
insert into public.tracoma_exam_answer_keys (
  question_number,
  expected_answer,
  answer_key_code,
  is_locked
)
values
  (1, 1, 'TF_PADRAO_OURO_V1', true),
  (2, 1, 'TF_PADRAO_OURO_V1', true),
  (3, 0, 'TF_PADRAO_OURO_V1', true),
  (4, 1, 'TF_PADRAO_OURO_V1', true),
  (5, 0, 'TF_PADRAO_OURO_V1', true),
  (6, 0, 'TF_PADRAO_OURO_V1', true),
  (7, 0, 'TF_PADRAO_OURO_V1', true),
  (8, 1, 'TF_PADRAO_OURO_V1', true),
  (9, 1, 'TF_PADRAO_OURO_V1', true),
  (10, 1, 'TF_PADRAO_OURO_V1', true),
  (11, 1, 'TF_PADRAO_OURO_V1', true),
  (12, 1, 'TF_PADRAO_OURO_V1', true),
  (13, 1, 'TF_PADRAO_OURO_V1', true),
  (14, 0, 'TF_PADRAO_OURO_V1', true),
  (15, 0, 'TF_PADRAO_OURO_V1', true),
  (16, 0, 'TF_PADRAO_OURO_V1', true),
  (17, 1, 'TF_PADRAO_OURO_V1', true),
  (18, 0, 'TF_PADRAO_OURO_V1', true),
  (19, 0, 'TF_PADRAO_OURO_V1', true),
  (20, 0, 'TF_PADRAO_OURO_V1', true),
  (21, 0, 'TF_PADRAO_OURO_V1', true),
  (22, 0, 'TF_PADRAO_OURO_V1', true),
  (23, 1, 'TF_PADRAO_OURO_V1', true),
  (24, 1, 'TF_PADRAO_OURO_V1', true),
  (25, 1, 'TF_PADRAO_OURO_V1', true),
  (26, 1, 'TF_PADRAO_OURO_V1', true),
  (27, 0, 'TF_PADRAO_OURO_V1', true),
  (28, 1, 'TF_PADRAO_OURO_V1', true),
  (29, 1, 'TF_PADRAO_OURO_V1', true),
  (30, 0, 'TF_PADRAO_OURO_V1', true),
  (31, 1, 'TF_PADRAO_OURO_V1', true),
  (32, 0, 'TF_PADRAO_OURO_V1', true),
  (33, 0, 'TF_PADRAO_OURO_V1', true),
  (34, 0, 'TF_PADRAO_OURO_V1', true),
  (35, 1, 'TF_PADRAO_OURO_V1', true),
  (36, 1, 'TF_PADRAO_OURO_V1', true),
  (37, 1, 'TF_PADRAO_OURO_V1', true),
  (38, 0, 'TF_PADRAO_OURO_V1', true),
  (39, 0, 'TF_PADRAO_OURO_V1', true),
  (40, 0, 'TF_PADRAO_OURO_V1', true),
  (41, 0, 'TF_PADRAO_OURO_V1', true),
  (42, 1, 'TF_PADRAO_OURO_V1', true),
  (43, 1, 'TF_PADRAO_OURO_V1', true),
  (44, 1, 'TF_PADRAO_OURO_V1', true),
  (45, 0, 'TF_PADRAO_OURO_V1', true),
  (46, 0, 'TF_PADRAO_OURO_V1', true),
  (47, 0, 'TF_PADRAO_OURO_V1', true),
  (48, 0, 'TF_PADRAO_OURO_V1', true),
  (49, 1, 'TF_PADRAO_OURO_V1', true),
  (50, 0, 'TF_PADRAO_OURO_V1', true)
on conflict (question_number) do nothing;

notify pgrst, 'reload schema';
