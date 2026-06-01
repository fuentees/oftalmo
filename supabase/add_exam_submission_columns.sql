-- Adiciona colunas de vínculo ao participante na tabela exam_submissions
-- Execute no SQL Editor do Supabase caso a tabela já exista sem essas colunas.

ALTER TABLE exam_submissions
  ADD COLUMN IF NOT EXISTS training_participant_id uuid,
  ADD COLUMN IF NOT EXISTS professional_rg text;

CREATE INDEX IF NOT EXISTS idx_exam_submissions_participant
  ON exam_submissions(training_participant_id);
