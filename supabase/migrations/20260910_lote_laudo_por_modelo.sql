-- ============================================================================
-- Lote e laudo passam a ser por OP + MODELO
--
-- Regra anterior: um lote por OP, e um laudo por entrega da OP.
-- Descobriu-se que uma mesma OP pode carregar MODELOS diferentes (o codigo
-- KING), e cada modelo precisa do seu proprio laudo — e do seu proprio lote.
--
-- Regra nova:
--   * LOTE  -> um por (OP, MODELO). Alocado na primeira vez que o par aparece
--              e reusado para sempre.
--   * LAUDO -> um por ENTREGA de (OP, MODELO). O mesmo modelo entregue duas
--              vezes na mesma OP tem dois laudos; a sequencia conta por
--              modelo, nao pela OP inteira.
--
-- As linhas que ja existem ficam com modelo = '' (string vazia), que
-- representa "emitido antes desta regra". Elas continuam validas e o par
-- (OP, '') segue funcionando; nenhum numero ja impresso e alterado.
--
-- ATENCAO OPERACIONAL: uma OP que ja tem lote com modelo '' vai alocar um
-- lote NOVO na primeira vez que for usada com um modelo preenchido. As
-- etiquetas ja impressas daquela OP continuam com o lote antigo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Coluna modelo nas duas tabelas
-- ---------------------------------------------------------------------------
ALTER TABLE prod_op_lote
    ADD COLUMN IF NOT EXISTS modelo TEXT NOT NULL DEFAULT '';

ALTER TABLE prod_op_laudo
    ADD COLUMN IF NOT EXISTS modelo TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN prod_op_lote.modelo IS
    'Codigo do modelo (sigla KING). String vazia = emitido antes da regra por modelo.';
COMMENT ON COLUMN prod_op_laudo.modelo IS
    'Codigo do modelo (sigla KING). String vazia = emitido antes da regra por modelo.';

-- ---------------------------------------------------------------------------
-- 2. Chaves: de (op) para (op, modelo)
--    A FK do laudo precisa cair antes da PK do lote poder ser trocada.
-- ---------------------------------------------------------------------------
ALTER TABLE prod_op_laudo DROP CONSTRAINT IF EXISTS prod_op_laudo_op_fkey;

ALTER TABLE prod_op_lote  DROP CONSTRAINT IF EXISTS prod_op_lote_pkey;
ALTER TABLE prod_op_lote  ADD  CONSTRAINT prod_op_lote_pkey
    PRIMARY KEY (op, modelo);

ALTER TABLE prod_op_laudo ADD  CONSTRAINT prod_op_laudo_op_modelo_fkey
    FOREIGN KEY (op, modelo) REFERENCES prod_op_lote (op, modelo) ON UPDATE CASCADE;

-- Sequencia passa a contar por modelo dentro da OP.
ALTER TABLE prod_op_laudo DROP CONSTRAINT IF EXISTS prod_op_laudo_op_sequencia_key;
ALTER TABLE prod_op_laudo ADD  CONSTRAINT prod_op_laudo_op_modelo_sequencia_key
    UNIQUE (op, modelo, sequencia);

CREATE INDEX IF NOT EXISTS idx_op_laudo_op_modelo ON prod_op_laudo (op, modelo);

-- ---------------------------------------------------------------------------
-- 3. Funcoes. As assinaturas mudam, entao as antigas caem primeiro
--    (CREATE OR REPLACE nao troca lista de argumentos).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS prod_lote_da_op(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS prod_novo_laudo(TEXT, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS prod_dados_da_op(TEXT);

-- Lote do par (OP, modelo): devolve o existente ou aloca o primeiro.
CREATE OR REPLACE FUNCTION prod_lote_da_op(
    p_op      TEXT,
    p_modelo  TEXT DEFAULT '',
    p_cliente TEXT DEFAULT NULL,
    p_produto TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_op     TEXT := upper(btrim(coalesce(p_op, '')));
    v_modelo TEXT := upper(btrim(coalesce(p_modelo, '')));
    v_lote   BIGINT;
BEGIN
    IF v_op = '' THEN
        RAISE EXCEPTION 'OP obrigatoria para gerar lote';
    END IF;

    -- Trava pelo par: duas telas na mesma OP com modelos diferentes podem
    -- seguir em paralelo; na mesma OP e mesmo modelo, enfileiram.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('prod_op_lote:' || v_op || '|' || v_modelo, 0));

    SELECT lote INTO v_lote
      FROM prod_op_lote WHERE op = v_op AND modelo = v_modelo;
    IF v_lote IS NOT NULL THEN
        RETURN v_lote;
    END IF;

    v_lote := prod_proximo_numero('lote');

    INSERT INTO prod_op_lote (op, modelo, lote, cliente, produto)
    VALUES (v_op, v_modelo, v_lote,
            nullif(btrim(coalesce(p_cliente, '')), ''),
            nullif(btrim(coalesce(p_produto, '')), ''));

    RETURN v_lote;
END;
$fn$;

-- Nova entrega de (OP, modelo).
CREATE OR REPLACE FUNCTION prod_novo_laudo(
    p_op         TEXT,
    p_modelo     TEXT    DEFAULT '',
    p_quantidade NUMERIC DEFAULT NULL,
    p_observacao TEXT    DEFAULT NULL,
    p_cliente    TEXT    DEFAULT NULL,
    p_produto    TEXT    DEFAULT NULL
)
RETURNS TABLE (id UUID, laudo BIGINT, sequencia INTEGER, lote BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_op     TEXT := upper(btrim(coalesce(p_op, '')));
    v_modelo TEXT := upper(btrim(coalesce(p_modelo, '')));
    v_lote   BIGINT;
    v_laudo  BIGINT;
    v_seq    INTEGER;
    v_id     UUID;
BEGIN
    IF v_op = '' THEN
        RAISE EXCEPTION 'OP obrigatoria para gerar laudo';
    END IF;

    -- Garante o lote do par (cria se for a primeira vez) e trava o par.
    v_lote := prod_lote_da_op(v_op, v_modelo, p_cliente, p_produto);

    SELECT coalesce(max(l.sequencia), 0) + 1 INTO v_seq
      FROM prod_op_laudo l WHERE l.op = v_op AND l.modelo = v_modelo;

    v_laudo := prod_proximo_numero('laudo');

    INSERT INTO prod_op_laudo (op, modelo, laudo, sequencia, quantidade, observacao)
    VALUES (v_op, v_modelo, v_laudo, v_seq, p_quantidade,
            nullif(btrim(coalesce(p_observacao, '')), ''))
    RETURNING prod_op_laudo.id INTO v_id;

    RETURN QUERY SELECT v_id, v_laudo, v_seq, v_lote;
END;
$fn$;

-- Consulta do par, sem alocar nada.
CREATE OR REPLACE FUNCTION prod_dados_da_op(
    p_op     TEXT,
    p_modelo TEXT DEFAULT ''
)
RETURNS TABLE (
    op         TEXT,
    modelo     TEXT,
    lote       BIGINT,
    cliente    TEXT,
    produto    TEXT,
    laudo_id   UUID,
    laudo      BIGINT,
    sequencia  INTEGER,
    quantidade NUMERIC,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT o.op, o.modelo, o.lote, o.cliente, o.produto,
           l.id, l.laudo, l.sequencia, l.quantidade, l.created_at
      FROM prod_op_lote o
      LEFT JOIN prod_op_laudo l ON l.op = o.op AND l.modelo = o.modelo
     WHERE o.op = upper(btrim(coalesce(p_op, '')))
       AND o.modelo = upper(btrim(coalesce(p_modelo, '')))
     ORDER BY l.sequencia;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Permissoes das novas assinaturas
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION prod_lote_da_op(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION prod_novo_laudo(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION prod_dados_da_op(TEXT, TEXT) TO authenticated;
