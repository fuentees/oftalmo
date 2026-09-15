-- =============================================================================
-- Diagnóstico + reforço das permissões de `anon` em training_participants
-- =============================================================================
-- Contexto: o formulário público de inscrição (usuário deslogado) está
-- recebendo "permission denied for table training_participants". Isso é um
-- erro de permissão do Postgres, não um bug de código — algo nas GRANTs/
-- policies aplicadas por supabase/harden_rls_baseline.sql não ficou como
-- esperado (grant parcial, execução interrompida, coluna adicionada depois
-- da migration, etc.).
--
-- Rode a PARTE 1 primeiro e leia o resultado. Se qualquer coisa parecer
-- faltando (ex.: linha do "anon" para insert ausente, ou poucas colunas no
-- select), rode a PARTE 2 — ela é idempotente (pode rodar quantas vezes
-- quiser sem efeito colateral) e reaplica exatamente o que
-- harden_rls_baseline.sql pretendia deixar configurado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PARTE 1 — Diagnóstico (só leitura, não altera nada)
-- -----------------------------------------------------------------------------

-- 1a. RLS está habilitado na tabela?
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname = 'training_participants';

-- 1b. Policies existentes (deveria ter 4: anon_select, anon_insert,
--     anon_update, authenticated)
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'training_participants'
order by policyname;

-- 1c. Grants de nível TABELA para anon (deveria ter pelo menos INSERT)
select grantee, privilege_type
from information_schema.table_privileges
where table_name = 'training_participants'
  and grantee = 'anon';

-- 1d. Grants de nível COLUNA para anon (select deveria ter só as colunas
--     não sensíveis; update deveria ter só presença/nota/aprovação)
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_name = 'training_participants'
  and grantee = 'anon'
order by privilege_type, column_name;

-- -----------------------------------------------------------------------------
-- PARTE 2 — Reaplicar policies + grants (idempotente — seguro rodar de novo)
-- -----------------------------------------------------------------------------

alter table public.training_participants enable row level security;

drop policy if exists training_participants_anon_select on public.training_participants;
create policy training_participants_anon_select
  on public.training_participants for select to anon using (true);

drop policy if exists training_participants_anon_insert on public.training_participants;
create policy training_participants_anon_insert
  on public.training_participants for insert to anon with check (training_id is not null);

drop policy if exists training_participants_anon_update on public.training_participants;
create policy training_participants_anon_update
  on public.training_participants for update to anon
  using (training_id is not null)
  with check (training_id is not null);

drop policy if exists training_participants_authenticated on public.training_participants;
create policy training_participants_authenticated
  on public.training_participants for all to authenticated using (true) with check (true);

-- Revoga qualquer grant de coluna herdado antes de reconceder a lista exata
-- (evita "grant" cumulativo deixar uma coluna sensível liberada por engano).
revoke select, update, insert on public.training_participants from anon;

grant select (
  id, training_id, training_title, training_date,
  professional_name, professional_rg, professional_cpf, professional_email,
  enrollment_status, attendance, attendance_records, attendance_percentage,
  approved, grade, certificate_issued
) on public.training_participants to anon;

grant update (
  attendance, attendance_records, attendance_percentage, approved, grade
) on public.training_participants to anon;

-- INSERT liberado em todas as colunas: é o próprio visitante preenchendo o
-- cadastro dele no formulário público (dado flui do visitante pro banco).
grant insert on public.training_participants to anon;

-- Sequências/usage no schema — sem isso, INSERT com id gerado por default
-- (gen_random_uuid()/sequence) também pode falhar com permission denied.
grant usage on schema public to anon;

-- -----------------------------------------------------------------------------
-- PARTE 3 — Confira de novo (deve mostrar a lista completa agora)
-- -----------------------------------------------------------------------------
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_name = 'training_participants'
  and grantee = 'anon'
order by privilege_type, column_name;

select grantee, privilege_type
from information_schema.table_privileges
where table_name = 'training_participants'
  and grantee = 'anon';
