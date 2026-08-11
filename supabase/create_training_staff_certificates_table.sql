-- Registro de certificados emitidos para equipe do treinamento (coordenador,
-- monitor, palestrante). Até agora esses certificados eram gerados na hora e
-- nunca ficavam salvos em lugar nenhum — diferente de training_participants,
-- não dava pra "baixar de novo" ou saber depois qual modelo/numero foi usado.
-- Execute no SQL Editor do Supabase.

create table if not exists public.training_staff_certificates (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete cascade,
  training_title text,
  professional_id uuid references public.professionals(id) on delete set null,
  professional_name text not null,
  professional_email text,
  professional_rg text,
  professional_cpf text,
  role text not null check (role in ('coordenador', 'monitor', 'palestrante')),
  lecture text,
  lecture_date date,
  certificate_number text,
  certificate_url text,
  certificate_issue_metadata jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists training_staff_certificates_certificate_number_key
  on public.training_staff_certificates (certificate_number)
  where certificate_number is not null;

create index if not exists idx_training_staff_certificates_professional
  on public.training_staff_certificates (professional_id);
create index if not exists idx_training_staff_certificates_training
  on public.training_staff_certificates (training_id);
create index if not exists idx_training_staff_certificates_email
  on public.training_staff_certificates (professional_email);

alter table public.training_staff_certificates enable row level security;
drop policy if exists training_staff_certificates_authenticated on public.training_staff_certificates;
create policy training_staff_certificates_authenticated
  on public.training_staff_certificates for all to authenticated using (true) with check (true);
-- Sem policy pra anon: essa tabela só é usada em telas autenticadas
-- (emissão dentro do treinamento e perfil do profissional).

notify pgrst, 'reload schema';
