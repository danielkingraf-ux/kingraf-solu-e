-- Create table for label history (pallet/info)
CREATE TABLE IF NOT EXISTS prod_etiquetas_historico (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL,
    op VARCHAR(50),
    cliente VARCHAR(200),
    produto VARCHAR(200),
    sku VARCHAR(50),
    quantidade VARCHAR(50),
    volume VARCHAR(50),
    data VARCHAR(20),
    info_extra JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster OP searches
CREATE INDEX IF NOT EXISTS idx_etiquetas_historico_op ON prod_etiquetas_historico(op);

-- Enable Row Level Security
ALTER TABLE prod_etiquetas_historico ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert/select/update/delete
CREATE POLICY "Allow insert for authenticated" ON prod_etiquetas_historico
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow select for authenticated" ON prod_etiquetas_historico
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow update for authenticated" ON prod_etiquetas_historico
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated" ON prod_etiquetas_historico
    FOR DELETE TO authenticated USING (true);
