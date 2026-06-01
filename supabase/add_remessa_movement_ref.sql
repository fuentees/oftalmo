-- Rastreabilidade: liga remessas às movimentações de saída que as originaram.
-- Execute no SQL Editor do Supabase.

ALTER TABLE remessas ADD COLUMN IF NOT EXISTS movement_ids jsonb DEFAULT '[]';
