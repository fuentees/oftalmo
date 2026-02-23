## Projeto de Treinamentos com Supabase

Este app usa React + Vite com Supabase (Postgres) para dados, autenticação e
armazenamento de arquivos.

### Requisitos

- Node.js LTS
- Conta no Supabase

### Configuração local

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Crie um arquivo `.env.local`:
   ```bash
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua_chave_anon
   VITE_SUPABASE_STORAGE_BUCKET=uploads
   # Segurança: mantenha false para bloquear cadastro público
   VITE_ALLOW_PUBLIC_SIGNUP=false
   # Opcional: e-mails com perfil admin (separados por vírgula)
   VITE_ADMIN_EMAILS=admin@seuorgao.gov.br
   # Opcional: nome da função de gestão de usuários admin
   VITE_SUPABASE_USER_ADMIN_FUNCTION=user-admin
   # Opcional: função de email no Supabase
   VITE_SUPABASE_EMAIL_FUNCTION=send-email
   # Opcional: webhook externo para envio de email
   VITE_EMAIL_WEBHOOK_URL=
   ```
3. Rode o app:
   ```bash
   npm run dev
   ```

### Configuração do Supabase

1. Crie um projeto no Supabase.
2. Execute o script `supabase/schema.sql` no SQL Editor para criar as tabelas.
   Se as tabelas já existirem, adicione as colunas novas no
   `training_participants` (ex.: `professional_formation`, `institution`,
   `state`, `health_region`, `municipality`, `unit_name`, `position`,
   `work_address`, `residential_address`, `commercial_phone`, `mobile_phone`).
   Também recomendamos executar a função `is_valid_cpf` e as constraints de CPF
   (no próprio `schema.sql`) para validação no backend.
   Para logo e palestrantes, adicione as colunas `logo_url` e `speakers` em `trainings`.
  Para avaliação, adicione a coluna `answers` em `training_feedback` e a tabela
  `training_feedback_questions` (ver `schema.sql`).
  Se aparecer o erro
  `Could not find the table 'public.training_feedback_questions' in the schema cache`,
  execute o script `supabase/create_training_feedback_questions_table.sql`.
  Para o canal interno de mensagens, execute também
  `supabase/create_communication_messages_table.sql`.
  Para o módulo "Avaliacao de Examinadores de tracoma - Teste de 50 Questoes",
  execute `supabase/create_tracoma_exam_tables.sql` (tabelas de gabarito e resultados).
   O mapeamento de Município x GVE agora é persistido na tabela
   `municipality_gve_mappings`.
3. Crie o bucket de armazenamento `uploads` e deixe como **public** (ou adapte
   a lógica para URLs assinadas).
4. Configure as políticas de RLS conforme sua necessidade. Para rotas públicas
   (ex.: inscrições), habilite **SELECT/INSERT** nas tabelas necessárias.
   Para operações internas (painel), libere SELECT/INSERT/UPDATE/DELETE para
   usuários autenticados nas tabelas `trainings`, `professionals`, etc.

### Segurança de cadastro (recomendado)

1. O frontend já vem com cadastro público **desativado por padrão**
   (`VITE_ALLOW_PUBLIC_SIGNUP=false`).
2. No Supabase, desative também o cadastro aberto:
   - **Authentication > Providers > Email > Enable email signups = OFF**.
3. Para novos usuários, crie convites manualmente:
   - **Authentication > Users > Invite user**.
4. Para definir perfil de admin, use uma das opções:
   - informar o e-mail em `VITE_ADMIN_EMAILS`, ou
   - definir `role: "admin"` nos metadados do usuário no Supabase.
5. Deploy da função de gestão de usuários (admin):
   ```bash
   supabase functions deploy user-admin
   ```
   Se a tela de usuários mostrar erro de conexão mesmo com a função deployada,
   faça deploy sem validação automática de JWT (a função já valida token no
   código e o preflight do navegador fica mais estável):
   ```bash
   supabase functions deploy user-admin --no-verify-jwt
   ```
   Se necessário, configure segredo para lista de admins por e-mail:
   ```bash
   supabase secrets set ADMIN_EMAILS=admin@seuorgao.gov.br
   ```
   Confira também se a função está no mesmo projeto do frontend:
   ```bash
   supabase link --project-ref <project_ref_do_VITE_SUPABASE_URL>
   ```

> Importante: desativar apenas no frontend não impede chamadas diretas à API de
> autenticação. Para segurança real, desative o signup no painel do Supabase.

### Envio de email

O app chama a função `send-email` via Supabase Functions. Você pode:
- Criar a função `send-email` no Supabase, **ou**
- Informar um webhook em `VITE_EMAIL_WEBHOOK_URL`.

Se nenhuma opção estiver configurada, o envio de emails exibirá erro.

### Limpeza de registros órfãos (participantes)

- No painel, acesse **Configurações > Planilhas > Executar limpeza de órfãos** para
  remover inscrições legadas sem vínculo válido com treinamentos.
- Para uma limpeza manual via SQL (batch), use o script:
  `supabase/cleanup_orphan_training_participants.sql`.
