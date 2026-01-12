-- Migration: Support multiple operators and sectors per revision
-- Date: 2026-01-07

CREATE TABLE IF NOT EXISTS qual_revisao_operadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revisao_id UUID NOT NULL REFERENCES qual_revisoes(id) ON DELETE CASCADE,
    operador_id UUID NOT NULL REFERENCES qual_operadores(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qual_revisao_setores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revisao_id UUID NOT NULL REFERENCES qual_revisoes(id) ON DELETE CASCADE,
    setor_id UUID NOT NULL REFERENCES qual_setores(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revisao_operadores_unique ON qual_revisao_operadores(revisao_id, operador_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revisao_setores_unique ON qual_revisao_setores(revisao_id, setor_id);
CREATE INDEX IF NOT EXISTS idx_revisao_operadores_revisao ON qual_revisao_operadores(revisao_id);
CREATE INDEX IF NOT EXISTS idx_revisao_setores_revisao ON qual_revisao_setores(revisao_id);
