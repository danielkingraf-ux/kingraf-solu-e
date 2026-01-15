/* Tabela de Registros de Produção (Já existente) */
CREATE TABLE IF NOT EXISTS producao_caixas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    op TEXT NOT NULL,
    cliente TEXT NOT NULL,
    produto TEXT NOT NULL,
    sku TEXT,
    unidades NUMERIC,
    tipo_caixa TEXT,
    qtd_fileiras INTEGER,
    qtd_macos_fileira INTEGER,
    qtd_por_maco INTEGER,
    altura INTEGER,
    total_macos INTEGER,
    total_itens INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID
);

/* Habilitar RLS para producao_caixas */
ALTER TABLE producao_caixas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'producao_caixas'
          AND policyname = 'Permitir acesso total para autenticados'
    ) THEN
        CREATE POLICY "Permitir acesso total para autenticados"
        ON producao_caixas
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

/* Tabela de Estoque */
CREATE TABLE IF NOT EXISTS prod_estoque (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    op TEXT NOT NULL,
    tipo_caixa TEXT,
    quantidade INTEGER NOT NULL,
    data_entrada DATE NOT NULL,
    data_liberacao DATE,
    liberada_producao BOOLEAN DEFAULT false,
    op_colada BOOLEAN DEFAULT false,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

/* Tabela de Tamanhos de Caixa */
CREATE TABLE IF NOT EXISTS prod_tamanhos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_caixa TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

/* Tabela de Usuários de Produção */
CREATE TABLE IF NOT EXISTS prod_usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_completo TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

/* Habilitar RLS e Policies para as novas tabelas */
ALTER TABLE prod_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_tamanhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_usuarios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prod_estoque'
          AND policyname = 'Acesso total prod_estoque'
    ) THEN
        CREATE POLICY "Acesso total prod_estoque" ON prod_estoque FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prod_tamanhos'
          AND policyname = 'Acesso total prod_tamanhos'
    ) THEN
        CREATE POLICY "Acesso total prod_tamanhos" ON prod_tamanhos FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prod_usuarios'
          AND policyname = 'Acesso total prod_usuarios'
    ) THEN
        CREATE POLICY "Acesso total prod_usuarios" ON prod_usuarios FOR ALL USING (true);
    END IF;
END $$;
