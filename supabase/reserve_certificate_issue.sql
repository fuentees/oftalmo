-- Run before deploying the on-demand certificate application.
-- Reuses existing numbers and never changes an existing issue or PDF.
create or replace function public.reserve_certificate_issue(
  p_participant_id uuid default null,
  p_staff jsonb default null,
  p_metadata jsonb default null,
  p_validity_date date default null
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_record jsonb;
  v_number text;
  v_sequence bigint;
  v_metadata jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if (p_participant_id is null) = (p_staff is null) then
    raise exception 'Choose one certificate recipient';
  end if;
  -- Serialize reservations across both tables, including repeat clicks.
  perform pg_advisory_xact_lock(724139526);
  if p_participant_id is not null then
    select to_jsonb(p) into v_record from public.training_participants p
    where p.id = p_participant_id for update;
    if v_record is null then raise exception 'Participant unavailable'; end if;
    if nullif(v_record->>'certificate_number', '') is not null then return v_record; end if;
    if nullif(v_record->>'certificate_url', '') is not null or
       coalesce((v_record->>'certificate_issued')::boolean, false) then
      raise exception 'Legacy certificate needs its original issue number verified';
    end if;
  else
    select to_jsonb(s) into v_record from public.training_staff_certificates s
    where s.training_id = (p_staff->>'training_id')::uuid
      and s.role = p_staff->>'role'
      and (case when nullif(p_staff->>'professional_id','') is not null
        then s.professional_id = (p_staff->>'professional_id')::uuid
        else lower(trim(s.professional_name)) = lower(trim(p_staff->>'professional_name'))
          and coalesce(s.professional_rg,'') = coalesce(p_staff->>'professional_rg','')
          and coalesce(s.professional_cpf,'') = coalesce(p_staff->>'professional_cpf','')
          and (coalesce(p_staff->>'professional_rg','') <> ''
            or coalesce(p_staff->>'professional_cpf','') <> ''
            or lower(trim(coalesce(s.professional_email,''))) = lower(trim(coalesce(p_staff->>'professional_email','')))) end)
      and coalesce(s.lecture,'') = coalesce(p_staff->>'lecture','')
      and s.lecture_date is not distinct from nullif(p_staff->>'lecture_date','')::date
    order by s.created_at asc limit 1;
    if v_record is not null then return v_record; end if;
  end if;
  if p_metadata->>'schema_version' is distinct from '1' or
     p_metadata->>'renderer_version' is distinct from '1' or
     nullif(p_metadata->>'template_key','') is null or
     p_metadata->'snapshot'->'training' is null or
     p_metadata->'snapshot'->'recipient' is null then
    raise exception 'Original certificate inputs required';
  end if;
  select coalesce(max(substring(n from '([0-9]{4,})$')::bigint),0) + 1
    into v_sequence from (
      select certificate_number n from public.training_participants
      union all select certificate_number from public.training_staff_certificates
    ) numbers;
  v_number := 'CERT-' || to_char(now() at time zone 'America/Sao_Paulo','YYYY') || '-' ||
    lpad(v_sequence::text, greatest(6,length(v_sequence::text)), '0');
  v_metadata := p_metadata || jsonb_build_object('number', v_number,
    'issued_at', now(), 'issued_on', to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'));
  if p_participant_id is not null then
    update public.training_participants p set
      certificate_number = v_number, certificate_issue_metadata = v_metadata,
      validity_date = p_validity_date, certificate_issued = true
    where p.id = p_participant_id returning to_jsonb(p) into v_record;
  else
    insert into public.training_staff_certificates as s (
      training_id, training_title, professional_id, professional_name,
      professional_email, professional_rg, professional_cpf, role, lecture,
      lecture_date, certificate_number, certificate_issue_metadata
    ) values (
      (p_staff->>'training_id')::uuid, p_staff->>'training_title',
      nullif(p_staff->>'professional_id','')::uuid, p_staff->>'professional_name',
      p_staff->>'professional_email', p_staff->>'professional_rg', p_staff->>'professional_cpf',
      p_staff->>'role', p_staff->>'lecture', nullif(p_staff->>'lecture_date','')::date,
      v_number, v_metadata
    ) returning to_jsonb(s) into v_record;
  end if;
  if v_record is null then raise exception 'Issue could not be saved'; end if;
  return v_record;
end;
$$;
revoke all on function public.reserve_certificate_issue(uuid,jsonb,jsonb,date) from public, anon;
grant execute on function public.reserve_certificate_issue(uuid,jsonb,jsonb,date) to authenticated;
notify pgrst, 'reload schema';
