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
3. Crie o bucket de armazenamento `uploads` e deixe como **public** (ou adapte
   a lógica para URLs assinadas).
4. Configure as políticas de RLS conforme sua necessidade. Para rotas públicas
   (ex.: inscrições), habilite **SELECT/INSERT** nas tabelas necessárias.

### Envio de email

O app chama a função `send-email` via Supabase Functions. Você pode:
- Criar a função `send-email` no Supabase, **ou**
- Informar um webhook em `VITE_EMAIL_WEBHOOK_URL`.

Se nenhuma opção estiver configurada, o envio de emails exibirá erro.
