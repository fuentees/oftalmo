-- =============================================================================
-- Hardening de RLS (Row Level Security) — baseline de segurança
-- =============================================================================
-- Contexto: quase nenhuma tabela deste projeto tinha RLS habilitado. O template
-- padrão do Supabase concede privilégios amplos (SELECT/INSERT/UPDATE/DELETE)
-- às roles `anon` e `authenticated` em todas as tabelas do schema `public` por
-- padrão — sem RLS, isso significa que QUALQUER visitante com a anon key
-- (visível no bundle JS, como é o caso de qualquer app client-side) consegue
-- ler e escrever a tabela inteira via API REST do PostgREST, não só o que a
-- tela pública "pretende" mostrar.
--
-- Este script:
--   1. Habilita RLS em todas as tabelas que ainda não tinham.
--   2. Para tabelas 100% internas (sem uso em página pública), permite acesso
--      total apenas para `authenticated` — `anon` fica sem nenhuma policy,
--      logo sem nenhum acesso.
--   3. Para tabelas usadas por páginas públicas sem login, cria policies
--      específicas por operação (select/insert/update), escopadas o máximo
--      possível dado o design atual do app (ver notas de arquitetura no final).
--   4. Reverte o "modo de emergência" que desabilitou RLS em shared_app_config
--      e training_materials.
--   5. Cria as tabelas/funções de apoio para o rate limiting do send-email e
--      para os lookups de attendance_links por token exato (evita que o token
--      de check-in seja "adivinhável" por listagem direta da tabela).
--
-- IMPORTANTE: revise antes de aplicar em produção. Rode no SQL Editor do
-- Supabase (ou `supabase db push`) fora do horário de maior uso, e teste os
-- fluxos públicos (inscrição, check-in, prova, feedback, solicitação de
-- material) logo em seguida.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Suporte a rate limiting do send-email
-- -----------------------------------------------------------------------------
create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  recipient text,
  client_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_send_log_recipient_created_at
  on public.email_send_log (recipient, created_at desc);
create index if not exists idx_email_send_log_ip_created_at
  on public.email_send_log (client_ip, created_at desc);

alter table public.email_send_log enable row level security;
-- Sem nenhuma policy: só a service_role (usada pela Edge Function) acessa esta
-- tabela — service_role ignora RLS por padrão no Supabase.

-- -----------------------------------------------------------------------------
-- 1. Tabelas 100% internas — acesso total só para `authenticated`
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'professionals', 'events', 'stock_movements', 'communication_messages',
    'app_logs', 'shared_app_config', 'training_materials',
    'training_waitlist', 'remessas', 'participant_notes'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_authenticated', t
    );
  end loop;
end $$;

-- Remove os grants amplos concedidos no "modo de emergência" — redundante com o
-- bloqueio de RLS acima, mas explícito para não depender só da ausência de policy.
revoke all on public.shared_app_config from anon;
revoke all on public.training_materials from anon;

-- Policies antigas "abertas" (sem TO, aplicavam a anon+authenticated) precisam
-- ser removidas antes das novas acima terem efeito prático:
drop policy if exists "waitlist_all_access" on public.training_waitlist;
drop policy if exists "remessas_all_access" on public.remessas;
drop policy if exists "participant_notes_all_access" on public.participant_notes;

-- audit_logs: leitura só para authenticated (a tela já é admin-only via UI);
-- nenhuma escrita pelo cliente — os registros são criados pelo trigger
-- log_audit_change(), que é SECURITY DEFINER e portanto ignora RLS.
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_authenticated_select on public.audit_logs;
create policy audit_logs_authenticated_select
  on public.audit_logs for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- 2. materials — a policy pública já existia, mas RLS nunca foi habilitado
--    (portanto estava inerte e a tabela ficava 100% aberta). Habilitando agora.
-- -----------------------------------------------------------------------------
alter table public.materials enable row level security;
drop policy if exists materials_authenticated on public.materials;
create policy materials_authenticated
  on public.materials for all to authenticated using (true) with check (true);
-- policy "materials_anon_read_available" (select para anon, available_for_request = true)
-- já existe em add_available_for_request_to_materials.sql e passa a ter efeito real.

-- -----------------------------------------------------------------------------
-- 3. trainings — páginas públicas listam e filtram treinamentos em memória
--    (inscrição, prova, feedback, teste de tracoma). Não há dado sensível
--    de profissional nesta tabela, então leitura pública ampla é aceitável.
-- -----------------------------------------------------------------------------
alter table public.trainings enable row level security;
drop policy if exists trainings_anon_select on public.trainings;
create policy trainings_anon_select on public.trainings for select to anon using (true);
drop policy if exists trainings_authenticated on public.trainings;
create policy trainings_authenticated
  on public.trainings for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 4. training_participants — a tabela mais sensível (CPF/RG/endereço/telefone).
--    NOTA DE ARQUITETURA: os fluxos públicos de check-in, prova e teste de
--    tracoma hoje baixam TODOS os participantes de um treinamento e casam por
--    RG/CPF no navegador (não existe token por participante). Isso impede uma
--    restrição por linha 100% granular sem reescrever esses fluxos para usar
--    uma função RPC "SECURITY DEFINER" que faça o match no banco e devolva só
--    a linha encontrada — recomendado como próximo passo, fora do escopo deste
--    script. Por ora, reduzimos o dano possível:
--      - leitura pública fica restrita às colunas realmente necessárias para
--        esses 3 fluxos (nunca endereço, telefone, instituição, região etc.);
--      - escrita pública (update) fica restrita às colunas de presença/nota/
--        aprovação — não é mais possível alterar CPF/e-mail/nome via update
--        público, mesmo enviando esses campos no payload.
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

-- Restringe COLUNAS legíveis/graváveis por anon (além da restrição por linha acima).
revoke select, update on public.training_participants from anon;
grant select (
  id, training_id, training_title, training_date,
  professional_name, professional_rg, professional_cpf, professional_email,
  enrollment_status, attendance, attendance_records, attendance_percentage,
  approved, grade, certificate_issued
) on public.training_participants to anon;
grant update (
  attendance, attendance_records, attendance_percentage, approved, grade
) on public.training_participants to anon;
-- INSERT continua liberado em todas as colunas: é o formulário público de
-- inscrição preenchendo o próprio cadastro (dado flui do visitante pro banco,
-- não o contrário — o risco aqui é spam de inscrições, não vazamento).
grant insert on public.training_participants to anon;

-- -----------------------------------------------------------------------------
-- 5. enrollment_fields / training_feedback_questions — apenas texto de
--    configuração de formulário, sem PII. Leitura pública ampla é segura.
-- -----------------------------------------------------------------------------
alter table public.enrollment_fields enable row level security;
drop policy if exists enrollment_fields_anon_select on public.enrollment_fields;
create policy enrollment_fields_anon_select
  on public.enrollment_fields for select to anon using (true);
drop policy if exists enrollment_fields_authenticated on public.enrollment_fields;
create policy enrollment_fields_authenticated
  on public.enrollment_fields for all to authenticated using (true) with check (true);

alter table public.training_feedback_questions enable row level security;
drop policy if exists training_feedback_questions_anon_select on public.training_feedback_questions;
create policy training_feedback_questions_anon_select
  on public.training_feedback_questions for select to anon using (true);
drop policy if exists training_feedback_questions_authenticated on public.training_feedback_questions;
create policy training_feedback_questions_authenticated
  on public.training_feedback_questions for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 6. training_feedback — resposta pública é sempre anônima (participant_id
--    nulo), então insert público é seguro; nenhuma leitura pública.
-- -----------------------------------------------------------------------------
alter table public.training_feedback enable row level security;
drop policy if exists training_feedback_anon_insert on public.training_feedback;
create policy training_feedback_anon_insert
  on public.training_feedback for insert to anon with check (training_id is not null);
drop policy if exists training_feedback_authenticated on public.training_feedback;
create policy training_feedback_authenticated
  on public.training_feedback for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 7. municipality_gve_mappings — usado no autocomplete de município da
--    inscrição pública; sem PII.
-- -----------------------------------------------------------------------------
alter table public.municipality_gve_mappings enable row level security;
drop policy if exists gve_mappings_anon_select on public.municipality_gve_mappings;
create policy gve_mappings_anon_select
  on public.municipality_gve_mappings for select to anon using (true);
drop policy if exists gve_mappings_authenticated on public.municipality_gve_mappings;
create policy gve_mappings_authenticated
  on public.municipality_gve_mappings for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 8. attendance_links — o `token` É o segredo do link de check-in. Se `anon`
--    puder ler a tabela livremente, dá pra descobrir tokens de outras turmas
--    sem nunca ter recebido o link. Por isso aqui NÃO damos select/update
--    direto pra anon — só via função SECURITY DEFINER com match exato de
--    token, que é seguro (equivalente a "só quem tem o link específico").
-- -----------------------------------------------------------------------------
alter table public.attendance_links enable row level security;
drop policy if exists attendance_links_authenticated on public.attendance_links;
create policy attendance_links_authenticated
  on public.attendance_links for all to authenticated using (true) with check (true);
-- Sem policy para anon = nenhum acesso direto à tabela por anon.
revoke all on public.attendance_links from anon;

create or replace function public.get_attendance_link_by_token(p_token text)
returns setof public.attendance_links
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.attendance_links
  where token = p_token
    and is_active = true
    and (expires_at is null or expires_at > now());
$$;
revoke all on function public.get_attendance_link_by_token(text) from public;
grant execute on function public.get_attendance_link_by_token(text) to anon, authenticated;

create or replace function public.increment_attendance_link_checkins(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.attendance_links
  set check_ins_count = coalesce(check_ins_count, 0) + 1
  where token = p_token;
$$;
revoke all on function public.increment_attendance_link_checkins(text) from public;
grant execute on function public.increment_attendance_link_checkins(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. exams / exam_questions / exam_submissions — as policies antigas eram
--    `FOR ALL USING (true)` sem `TO`, ou seja, qualquer anon podia até
--    DELETAR provas inteiras. Substituídas por policies restritas por
--    operação. NOTA DE ARQUITETURA: exam_questions ainda inclui o gabarito
--    (correct_answer/options[].is_correct) no payload lido publicamente,
--    porque a correção é feita no navegador — RLS de linha não resolve isso
--    sozinho; mover a correção para uma função no banco é o fix completo,
--    fora do escopo deste script.
-- -----------------------------------------------------------------------------
drop policy if exists "exams_open" on public.exams;
drop policy if exists exams_anon_select on public.exams;
create policy exams_anon_select on public.exams for select to anon using (is_active = true);
drop policy if exists exams_authenticated on public.exams;
create policy exams_authenticated on public.exams for all to authenticated using (true) with check (true);

drop policy if exists "exam_questions_open" on public.exam_questions;
drop policy if exists exam_questions_anon_select on public.exam_questions;
create policy exam_questions_anon_select
  on public.exam_questions for select to anon
  using (exists (
    select 1 from public.exams e
    where e.id = exam_questions.exam_id and e.is_active = true
  ));
drop policy if exists exam_questions_authenticated on public.exam_questions;
create policy exam_questions_authenticated
  on public.exam_questions for all to authenticated using (true) with check (true);

drop policy if exists "exam_submissions_open" on public.exam_submissions;
drop policy if exists exam_submissions_anon_insert on public.exam_submissions;
create policy exam_submissions_anon_insert
  on public.exam_submissions for insert to anon with check (exam_id is not null);
drop policy if exists exam_submissions_authenticated on public.exam_submissions;
create policy exam_submissions_authenticated
  on public.exam_submissions for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 10. tracoma_exam_answer_keys / tracoma_exam_results — hoje sem NENHUM RLS
--     (a tabela nem tinha ENABLE ROW LEVEL SECURITY). NOTA DE ARQUITETURA:
--     TracomaExaminerTest.jsx baixa o gabarito ouro inteiro pro navegador
--     para pontuar localmente — mesma limitação do item 9, mesmo fix
--     recomendado (mover pontuação para função no banco).
-- -----------------------------------------------------------------------------
alter table public.tracoma_exam_answer_keys enable row level security;
drop policy if exists tracoma_answer_keys_anon_select on public.tracoma_exam_answer_keys;
create policy tracoma_answer_keys_anon_select
  on public.tracoma_exam_answer_keys for select to anon using (true);
drop policy if exists tracoma_answer_keys_authenticated on public.tracoma_exam_answer_keys;
create policy tracoma_answer_keys_authenticated
  on public.tracoma_exam_answer_keys for all to authenticated using (true) with check (true);

alter table public.tracoma_exam_results enable row level security;
drop policy if exists tracoma_results_anon_insert on public.tracoma_exam_results;
create policy tracoma_results_anon_insert
  on public.tracoma_exam_results for insert to anon with check (training_id is not null);
drop policy if exists tracoma_results_authenticated on public.tracoma_exam_results;
create policy tracoma_results_authenticated
  on public.tracoma_exam_results for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 11. material_requests / materials já tinham RLS parcial correto
--     (create_material_requests_table.sql / add_available_for_request_to_materials.sql).
--     Nenhuma mudança necessária além do item 2 (habilitar RLS em materials).
-- -----------------------------------------------------------------------------

notify pgrst, 'reload schema';
