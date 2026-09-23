-- ============================================================================
-- Plano de palete por OP: o que a OP pede x o que o corte e vinco rodou
--
-- Duas contas diferentes que vivem juntas na mesma tela:
--
--   1. O QUE A OP PEDE. 500.000 pecas, 300 por caixa, 30 caixas por palete
--      -> 1.666,67 caixas -> 55,5 paletes. E a meta.
--
--   2. O QUE O VINCO RODOU. folhas x bocas = pecas que existem de verdade.
--      Tem que dar A MAIS que a OP, senao a OP nao fecha: entre o vinco e a
--      expedicao sempre se perde peca (refile, acerto, defeito).
--
-- A tabela guarda os numeros ligados a OP para nao redigitar a cada palete.
-- Uma linha por OP: o plano e da ordem inteira, nao de um palete.
--
-- Nao encosta em prod_op_lote nem em prod_op_laudo: lote e laudo continuam
-- sendo assunto do par OP+modelo, e este plano e so da OP.
-- ============================================================================

CREATE TABLE IF NOT EXISTS prod_op_palete_plano (
    op                   TEXT PRIMARY KEY,
    -- Quanto a OP pede, em pecas.
    quantidade_op        NUMERIC,
    -- Quanto o corte e vinco rodou: folhas passadas na maquina...
    folhas_vinco         NUMERIC,
    -- ...e quantas pecas saem de cada folha (as bocas da faca).
    bocas                INTEGER,
    -- Embalagem. Repetido aqui porque o palete seguinte da mesma OP embala
    -- igual, e redigitar a cada etiqueta e onde o erro entra.
    quantidade_por_caixa NUMERIC,
    caixas_por_pallet    INTEGER,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE prod_op_palete_plano IS
    'Um plano por OP: quanto a OP pede, quanto o vinco rodou e como embala. So alimenta a conta da etiqueta de palete.';
COMMENT ON COLUMN prod_op_palete_plano.folhas_vinco IS
    'Folhas rodadas no corte e vinco. Com as bocas, da as pecas que existem de verdade.';
COMMENT ON COLUMN prod_op_palete_plano.bocas IS
    'Pecas por folha (bocas da faca). folhas_vinco x bocas = pecas produzidas.';

-- A OP e a chave: se a mesma OP entrar como "20418 " e "20418", viram duas
-- linhas e o operador ve o plano sumir. O banco normaliza junto com a tela.
CREATE OR REPLACE FUNCTION prod_palete_plano_normaliza()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    NEW.op := upper(btrim(coalesce(NEW.op, '')));
    IF NEW.op = '' THEN
        RAISE EXCEPTION 'OP obrigatoria no plano de palete';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_prod_palete_plano_normaliza ON prod_op_palete_plano;
CREATE TRIGGER trg_prod_palete_plano_normaliza
    BEFORE INSERT OR UPDATE ON prod_op_palete_plano
    FOR EACH ROW EXECUTE FUNCTION prod_palete_plano_normaliza();

-- Mesmo padrao das outras tabelas do modulo: acesso total para quem esta
-- logado, nada para anon (a anon key fica exposta no bundle do front).
ALTER TABLE prod_op_palete_plano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total prod_op_palete_plano" ON prod_op_palete_plano;
CREATE POLICY "Acesso total prod_op_palete_plano" ON prod_op_palete_plano
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
