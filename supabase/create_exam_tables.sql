-- Sistema de Provas para Treinamentos
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS exams (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text    NOT NULL,
  description   text,
  training_id   uuid,
  training_title text,
  passing_score numeric NOT NULL DEFAULT 60,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id        uuid    REFERENCES exams(id) ON DELETE CASCADE,
  ordem          integer NOT NULL DEFAULT 1,
  type           text    NOT NULL DEFAULT 'multiple_choice',
  text           text    NOT NULL DEFAULT '',
  image_url      text,
  points         numeric NOT NULL DEFAULT 1,
  options        jsonb   NOT NULL DEFAULT '[]',
  correct_answer text,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id, ordem ASC);

CREATE TABLE IF NOT EXISTS exam_submissions (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id                 uuid,
  exam_title              text,
  -- Vínculo com o participante inscrito no treinamento
  training_participant_id uuid,
  professional_rg         text,
  -- Dados exibidos nas listagens
  participant_name        text    NOT NULL,
  participant_cpf         text,
  answers                 jsonb   NOT NULL DEFAULT '{}',
  score                   numeric NOT NULL DEFAULT 0,
  max_score               numeric NOT NULL DEFAULT 0,
  percentage              numeric NOT NULL DEFAULT 0,
  passed                  boolean NOT NULL DEFAULT false,
  submitted_at            timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam ON exam_submissions(exam_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_participant ON exam_submissions(training_participant_id);

ALTER TABLE exams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exams' AND policyname='exams_open') THEN
    CREATE POLICY "exams_open" ON exams FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_questions' AND policyname='exam_questions_open') THEN
    CREATE POLICY "exam_questions_open" ON exam_questions FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_submissions' AND policyname='exam_submissions_open') THEN
    CREATE POLICY "exam_submissions_open" ON exam_submissions FOR ALL USING (true);
  END IF;
END $$;
