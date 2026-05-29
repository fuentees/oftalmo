-- Adiciona suporte a lista de espera nos treinamentos.
-- Execute no SQL Editor do Supabase.

-- 1. Flag para habilitar lista de espera por treinamento
ALTER TABLE trainings
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean DEFAULT false;

-- 2. Tabela de lista de espera
CREATE TABLE IF NOT EXISTS training_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid REFERENCES trainings(id) ON DELETE CASCADE NOT NULL,
  training_title text,
  professional_name text,
  professional_email text,
  professional_cpf text,
  professional_rg text,
  professional_registration text,
  professional_sector text,
  professional_formation text,
  institution text,
  state text,
  municipality text,
  position text,
  commercial_phone text,
  mobile_phone text,
  notes text,
  position_in_queue integer,
  notified boolean DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. Índice para busca rápida por treinamento e posição na fila
CREATE INDEX IF NOT EXISTS idx_training_waitlist_training_id
  ON training_waitlist(training_id, position_in_queue);

-- 4. RLS (ajuste conforme sua política existente)
ALTER TABLE training_waitlist ENABLE ROW LEVEL SECURITY;

-- Política permissiva (ajuste se necessário para restringir acesso)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'training_waitlist'
      AND policyname = 'waitlist_all_access'
  ) THEN
    CREATE POLICY "waitlist_all_access"
      ON training_waitlist FOR ALL USING (true);
  END IF;
END $$;
