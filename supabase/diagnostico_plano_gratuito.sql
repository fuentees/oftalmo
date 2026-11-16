-- Diagnostico somente leitura. Execute no SQL Editor do projeto.
-- Nao retorna nomes, emails, documentos ou conteudo dos registros.
-- Trafego mensal e invocacoes devem ser conferidos em Usage no painel.
BEGIN TRANSACTION READ ONLY;

-- Tamanho total: inclui tabelas internas, indices e dados auxiliares.
SELECT pg_size_pretty(sum(pg_database_size(datname))::bigint) AS tamanho_total,
       round(sum(pg_database_size(datname)) / 1024 / 1024, 2) AS total_mib
FROM pg_database;

-- Maiores tabelas; quantidade de registros e uma estimativa do Postgres.
SELECT schemaname AS esquema, relname AS tabela,
       n_live_tup AS registros_estimados,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamanho_com_indices,
       pg_size_pretty(pg_indexes_size(relid)) AS indices
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 30;

-- Arquivos por bucket. Metadados podem nao refletir a medicao da cobranca.
SELECT bucket_id, count(*) AS arquivos,
       round(coalesce(sum(CASE
         WHEN metadata->>'size' ~ '^[0-9]+$'
         THEN (metadata->>'size')::numeric ELSE 0 END), 0) / 1024 / 1024, 2) AS tamanho_mib
FROM storage.objects
GROUP BY bucket_id
ORDER BY tamanho_mib DESC;

SELECT count(*) AS usuarios_cadastrados FROM auth.users;

-- Estrutura real: identifica tabelas sem RLS sem ler dados pessoais.
SELECT c.relname AS tabela, c.relrowsecurity AS rls_ativada
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

COMMIT;
