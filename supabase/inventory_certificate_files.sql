-- Read-only inventory for backup. An unreferenced file is NOT automatically
-- disposable: emails and external links may still point at its public URL.
-- Export the single JSON cell as CSV to avoid the SQL Editor's 100-row cap.
with refs as (
  select certificate_url as url, 'participant' as origin from training_participants where certificate_url is not null
  union all select certificate_url, 'staff' from training_staff_certificates where certificate_url is not null
  union all select file_url, 'material' from training_materials where file_url is not null
  union all select image_url, 'exam' from exam_questions where image_url is not null
  union all select logo_url, 'logo' from trainings where logo_url is not null
), inventory as (
  select o.bucket_id, o.name as object_path, (o.metadata->>'size')::bigint as bytes,
    o.metadata->>'mimetype' as mime_type, o.created_at,
    coalesce((select string_agg(distinct r.origin, ',') from refs r
      where split_part(r.url, '/storage/v1/object/public/', 2) = o.bucket_id||'/'||o.name), 'unreferenced') as reference_type
  from storage.objects o where o.metadata->>'mimetype' = 'application/pdf'
  order by (o.metadata->>'size')::bigint desc
)
select jsonb_agg(inventory) as inventory_json from inventory;
