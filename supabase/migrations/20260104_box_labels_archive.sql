-- Create table for box labels archive
CREATE TABLE IF NOT EXISTS prod_etiquetas_caixa (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    op VARCHAR(50) NOT NULL,
    cliente VARCHAR(200),
    produto VARCHAR(200),
    cli VARCHAR(50),
    quantidade VARCHAR(50),
    lote VARCHAR(50),
    data_acabamento VARCHAR(20),
    validade VARCHAR(20),
    laudo VARCHAR(100),
    emissor VARCHAR(100),
    operador VARCHAR(100),
    hora VARCHAR(10),
    range_start INTEGER DEFAULT 1,
    range_end INTEGER DEFAULT 8,
    range_total INTEGER DEFAULT 8,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster OP searches
CREATE INDEX IF NOT EXISTS idx_etiquetas_caixa_op ON prod_etiquetas_caixa(op);

-- Enable Row Level Security
ALTER TABLE prod_etiquetas_caixa ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert
CREATE POLICY "Allow insert for authenticated" ON prod_etiquetas_caixa
    FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to select
CREATE POLICY "Allow select for authenticated" ON prod_etiquetas_caixa
    FOR SELECT TO authenticated USING (true);
