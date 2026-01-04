-- Migration: Add operador_id column to qual_revisoes
-- Created: 2026-01-03

ALTER TABLE qual_revisoes 
ADD COLUMN IF NOT EXISTS operador_id UUID REFERENCES qual_operadores(id);

COMMENT ON COLUMN qual_revisoes.operador_id IS 'Operador que produziu o material sendo revisado';
