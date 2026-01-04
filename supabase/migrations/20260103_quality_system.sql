-- Migration: Create Quality System Base Tables
-- Date: 2026-01-03

-- 1. Revisores (Reviewers)
CREATE TABLE IF NOT EXISTS qual_revisores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Setores (Sectors)
CREATE TABLE IF NOT EXISTS qual_setores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL UNIQUE,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tipos de Desvios (Deviation Types)
CREATE TABLE IF NOT EXISTS qual_tipos_desvios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Operadores (Operators - if not exists from Production module)
CREATE TABLE IF NOT EXISTS qual_operadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    setor_id UUID REFERENCES qual_setores(id),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Máquinas (Machines - if not exists from Production module)
CREATE TABLE IF NOT EXISTS qual_maquinas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL,
    setor_id UUID REFERENCES qual_setores(id),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Revisões (Main Revision Records)
CREATE TABLE IF NOT EXISTS qual_revisoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    op VARCHAR(50) NOT NULL, -- Production Order number
    setor_origem_id UUID REFERENCES qual_setores(id),
    operador_id UUID REFERENCES qual_operadores(id), -- Operator who ran the material
    quantidade_revisada INT DEFAULT 0,
    quantidade_aprovada INT DEFAULT 0,
    quantidade_reprovada INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'em_andamento', -- 'em_andamento', 'finalizada'
    observacao_geral TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.1 Revisão Tempos (Support for multiple time periods)
CREATE TABLE IF NOT EXISTS qual_revisao_tempos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revisao_id UUID NOT NULL REFERENCES qual_revisoes(id) ON DELETE CASCADE,
    data_inicio TIMESTAMPTZ NOT NULL,
    data_fim TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Revisores por Revisão (Many-to-Many: Reviewers assigned to a Revision)
CREATE TABLE IF NOT EXISTS qual_revisao_revisores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revisao_id UUID NOT NULL REFERENCES qual_revisoes(id) ON DELETE CASCADE,
    revisor_id UUID NOT NULL REFERENCES qual_revisores(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Desvios por Revisão (Deviations found within a Revision)
CREATE TABLE IF NOT EXISTS qual_revisao_desvios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revisao_id UUID NOT NULL REFERENCES qual_revisoes(id) ON DELETE CASCADE,
    tipo_desvio_id UUID NOT NULL REFERENCES qual_tipos_desvios(id),
    operador_id UUID REFERENCES qual_operadores(id), -- Operator who caused the deviation
    maquina_id UUID REFERENCES qual_maquinas(id), -- Machine related to the deviation
    quantidade INT DEFAULT 0, -- Number of items with this deviation
    observacao TEXT,
    foto_url TEXT, -- URL to uploaded photo evidence
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_revisoes_op ON qual_revisoes(op);
CREATE INDEX IF NOT EXISTS idx_revisoes_setor ON qual_revisoes(setor_origem_id);
CREATE INDEX IF NOT EXISTS idx_revisao_desvios_revisao ON qual_revisao_desvios(revisao_id);
CREATE INDEX IF NOT EXISTS idx_revisao_desvios_tipo ON qual_revisao_desvios(tipo_desvio_id);

-- Seed some initial deviation types
INSERT INTO qual_tipos_desvios (nome, descricao) VALUES
('Vinco estourando', 'Vinco danificado ou estourando'),
('Cor fora', 'Cor fora do padrão'),
('Falha no hot', 'Problema na aplicação de hot stamping'),
('Fiapo', 'Presença de fiapos no material'),
('Manchas', 'Manchas visíveis no produto'),
('Registro fora', 'Registro de impressão fora do padrão'),
('Amassado', 'Material amassado ou deformado'),
('Risco', 'Riscos visíveis no material'),
('Cola vazando', 'Excesso ou vazamento de cola'),
('Corte irregular', 'Corte fora das especificações')
ON CONFLICT (nome) DO NOTHING;

-- Seed some initial sectors
INSERT INTO qual_setores (nome) VALUES
('Colagem'),
('Impressão'),
('Corte vinco'),
('Destaque'),
('Hot stamping')
ON CONFLICT (nome) DO NOTHING;
