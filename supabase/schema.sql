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

create table if not exists app_logs (
  id uuid primary key default gen_random_uuid(),
  page_name text,
  user_id uuid,
  user_email text,
  created_at timestamptz default now()
);

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
