-- Tabela de notas internas sobre participantes.
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS participant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_cpf text,
  professional_email text,
  note text NOT NULL,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participant_notes_cpf
  ON participant_notes(professional_cpf)
  WHERE professional_cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participant_notes_email
  ON participant_notes(professional_email)
  WHERE professional_email IS NOT NULL;

ALTER TABLE participant_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'participant_notes'
      AND policyname = 'participant_notes_all_access'
  ) THEN
    CREATE POLICY "participant_notes_all_access"
      ON participant_notes FOR ALL USING (true);
  END IF;
END $$;
