-- Tabela de Relações de Remessa de Materiais
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS remessas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  ano integer NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  para_destino text,
  para_gve text,
  interessado text,
  items jsonb DEFAULT '[]',
  responsavel text,
  responsavel_cargo text,
  status text DEFAULT 'emitida',
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (numero, ano)
);

-- Índice para busca rápida por ano
CREATE INDEX IF NOT EXISTS idx_remessas_ano ON remessas (ano DESC, numero DESC);

-- Função para obter próximo número do ano
CREATE OR REPLACE FUNCTION next_remessa_number(p_ano integer)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE v_next integer;
BEGIN
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_next
  FROM remessas WHERE ano = p_ano;
  RETURN v_next;
END;
$$;

ALTER TABLE remessas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'remessas' AND policyname = 'remessas_all_access'
  ) THEN
    CREATE POLICY "remessas_all_access" ON remessas FOR ALL USING (true);
  END IF;
END $$;
