-- Schema inicial para o app de treinamentos no Supabase
-- Execute no SQL Editor do Supabase.

create table if not exists trainings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  code text,
  type text,
  category text,
  description text,
  dates jsonb,
  date date,
  duration_hours integer,
  location text,
  online_link text,
  coordinator text,
  coordinator_email text,
  instructor text,
  monitors jsonb,
  max_participants integer,
  participants_count integer default 0,
  status text,
  validity_months integer,
  logo_url text,
  speakers jsonb,
  notes text,
  created_at timestamptz default now()
);

create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration text,
  rg text,
  cpf text,
  email text,
  phone text,
  sector text,
  position text,
  admission_date date,
  status text,
  created_at timestamptz default now()
);

create table if not exists training_participants (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references trainings(id) on delete cascade,
  training_title text,
  training_date date,
  professional_id uuid references professionals(id),
  professional_name text,
  professional_registration text,
  professional_rg text,
  professional_cpf text,
  professional_email text,
  professional_sector text,
  professional_formation text,
  institution text,
  state text,
  health_region text,
  municipality text,
  unit_name text,
  position text,
  work_address text,
  residential_address text,
  commercial_phone text,
  mobile_phone text,
  attendance text,
  attendance_records jsonb,
  attendance_percentage integer,
  approved boolean,
  grade text,
  enrollment_status text,
  enrollment_date timestamptz,
  certificate_issued boolean default false,
  certificate_sent_date timestamptz,
  certificate_url text,
  validity_date date,
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text,
  description text,
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  location text,
  professional_ids uuid[],
  professional_names text[],
  status text,
  color text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  description text,
  unit text,
  category text,
  minimum_stock integer,
  current_stock integer,
  location text,
  expiry_date date,
  status text,
  created_at timestamptz default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references materials(id) on delete set null,
  material_name text,
  type text,
  quantity integer,
  date date,
  responsible text,
  sector text,
  document_number text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists training_materials (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references trainings(id) on delete cascade,
  training_title text,
  name text,
  description text,
  file_url text,
  file_type text,
  uploaded_by text,
  created_at timestamptz default now()
);

create table if not exists training_feedback (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references trainings(id) on delete cascade,
  training_title text,
  participant_id uuid references training_participants(id) on delete set null,
  participant_name text,
  rating integer,
  content_quality integer,
  instructor_rating integer,
  comments text,
  would_recommend boolean,
  answers jsonb,
  created_at timestamptz default now()
);

create table if not exists training_feedback_questions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references trainings(id) on delete cascade,
  question_text text not null,
  question_type text default 'rating',
  required boolean default true,
  "order" integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists attendance_links (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references trainings(id) on delete cascade,
  training_title text,
  date date,
  token text,
  expires_at timestamptz,
  is_active boolean default true,
  check_ins_count integer default 0,
  created_at timestamptz default now()
);

create table if not exists enrollment_fields (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references trainings(id) on delete cascade,
  field_key text not null,
  label text,
  type text,
  required boolean default false,
  placeholder text,
  section text,
  "order" integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz default now(),
  user_name text,
  user_email text,
  action text,
  entity_type text,
  entity_name text,
  changes jsonb
);

create table if not exists material_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  requester_name text,
  requester_email text,
  details jsonb
);

create table if not exists communication_messages (
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
end $$;

do $$
begin
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

create table if not exists municipality_gve_mappings (
  id uuid primary key default gen_random_uuid(),
  municipio text not null,
  gve text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'municipality_gve_mappings_municipio_key'
  ) then
    alter table public.municipality_gve_mappings
      add constraint municipality_gve_mappings_municipio_key unique (municipio);
  end if;
end $$;

create table if not exists app_logs (
  id uuid primary key default gen_random_uuid(),
  page_name text,
  user_id uuid,
  user_email text,
  created_at timestamptz default now()
);

create table if not exists tracoma_exam_answer_keys (
  id uuid primary key default gen_random_uuid(),
  question_number integer not null,
  expected_answer smallint not null check (expected_answer in (0, 1)),
  answer_key_code text not null default 'E2',
  is_locked boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (question_number between 1 and 50)
);

create table if not exists tracoma_exam_results (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references trainings(id) on delete set null,
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
  answer_key_code text default 'E2',
  answers jsonb not null,
  created_at timestamptz default now(),
  check (total_questions > 0)
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'tracoma_exam_answer_keys_question_number_key'
      and conrelid = 'public.tracoma_exam_answer_keys'::regclass
  ) then
    alter table public.tracoma_exam_answer_keys
      drop constraint tracoma_exam_answer_keys_question_number_key;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracoma_exam_answer_keys_code_question_key'
      and conrelid = 'public.tracoma_exam_answer_keys'::regclass
  ) then
    alter table public.tracoma_exam_answer_keys
      add constraint tracoma_exam_answer_keys_code_question_key
      unique (answer_key_code, question_number);
  end if;

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

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_tracoma_exam_results_answer_key_code'
  ) then
    create index idx_tracoma_exam_results_answer_key_code
      on public.tracoma_exam_results (answer_key_code);
  end if;
end $$;

-- Validação de CPF (backend)
create or replace function public.is_valid_cpf(cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  digits text;
  sum int;
  check_digit int;
  i int;
begin
  if cpf is null or btrim(cpf) = '' then
    return true;
  end if;

  digits := regexp_replace(cpf, '\D', '', 'g');
  if length(digits) <> 11 then
    return false;
  end if;

  if digits ~ '^(\d)\1{10}$' then
    return false;
  end if;

  sum := 0;
  for i in 1..9 loop
    sum := sum + (substring(digits from i for 1)::int) * (11 - i);
  end loop;
  check_digit := (sum * 10) % 11;
  if check_digit = 10 then
    check_digit := 0;
  end if;
  if check_digit <> substring(digits from 10 for 1)::int then
    return false;
  end if;

  sum := 0;
  for i in 1..10 loop
    sum := sum + (substring(digits from i for 1)::int) * (12 - i);
  end loop;
  check_digit := (sum * 10) % 11;
  if check_digit = 10 then
    check_digit := 0;
  end if;
  if check_digit <> substring(digits from 11 for 1)::int then
    return false;
  end if;

  return true;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'professionals_cpf_valid'
  ) then
    alter table public.professionals
      add constraint professionals_cpf_valid check (public.is_valid_cpf(cpf));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'training_participants_cpf_valid'
  ) then
    alter table public.training_participants
      add constraint training_participants_cpf_valid check (public.is_valid_cpf(professional_cpf));
  end if;
end $$;
