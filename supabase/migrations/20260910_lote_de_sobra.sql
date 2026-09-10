-- ============================================================================
-- Lote de SOBRA
--
-- A sobra sai da mesma OP e do mesmo modelo da producao normal, mas precisa
-- de um lote SEPARADO para nao se misturar com o material bom. Nao consome
-- numero de laudo: sobra nao e entrega.
--
-- Em vez de tabela nova, a sobra entra como terceira parte da chave:
--   (OP, MODELO, SOBRA) -> um lote.
-- Assim toda a mecanica que ja existe (trava por par, contador gapless,
-- reuso na reimpressao) vale para a sobra sem nenhum caso especial.
--
--   OP 20144 / KING 90.001.10746 / sobra = false  -> lote 85551
--   OP 20144 / KING 90.001.10746 / sobra = true   -> lote 85552
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Coluna sobra
--    Vai tambem em prod_op_laudo porque a FK e composta: laudo sempre aponta
--    para a linha de producao normal (sobra = false).
-- ---------------------------------------------------------------------------
ALTER TABLE prod_op_lote
    ADD COLUMN IF NOT EXISTS sobra BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE prod_op_laudo
    ADD COLUMN IF NOT EXISTS sobra BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE prod_etiquetas_caixa
    ADD COLUMN IF NOT EXISTS sobra BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN prod_op_lote.sobra IS
    'true = lote de sobra daquele par OP+modelo. Numero separado do lote normal.';
COMMENT ON COLUMN prod_etiquetas_caixa.sobra IS
    'Etiqueta impressa a partir do lote de sobra.';

-- ---------------------------------------------------------------------------
-- 2. Chaves: a sobra entra na PK e na FK
-- ---------------------------------------------------------------------------
ALTER TABLE prod_op_laudo DROP CONSTRAINT IF EXISTS prod_op_laudo_op_modelo_fkey;

ALTER TABLE prod_op_lote  DROP CONSTRAINT IF EXISTS prod_op_lote_pkey;
ALTER TABLE prod_op_lote  ADD  CONSTRAINT prod_op_lote_pkey
    PRIMARY KEY (op, modelo, sobra);

ALTER TABLE prod_op_laudo ADD  CONSTRAINT prod_op_laudo_op_modelo_sobra_fkey
    FOREIGN KEY (op, modelo, sobra) REFERENCES prod_op_lote (op, modelo, sobra)
    ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Funcoes
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS prod_lote_da_op(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS prod_dados_da_op(TEXT, TEXT);

-- Lote do par (OP, modelo, sobra).
CREATE OR REPLACE FUNCTION prod_lote_da_op(
    p_op      TEXT,
    p_modelo  TEXT    DEFAULT '',
    p_sobra   BOOLEAN DEFAULT false,
    p_cliente TEXT    DEFAULT NULL,
    p_produto TEXT    DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_op     TEXT    := upper(btrim(coalesce(p_op, '')));
    v_modelo TEXT    := upper(btrim(coalesce(p_modelo, '')));
    v_sobra  BOOLEAN := coalesce(p_sobra, false);
    v_lote   BIGINT;
BEGIN
    IF v_op = '' THEN
        RAISE EXCEPTION 'OP obrigatoria para gerar lote';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('prod_op_lote:' || v_op || '|' || v_modelo ||
                         '|' || v_sobra::TEXT, 0));

    SELECT lote INTO v_lote
      FROM prod_op_lote
     WHERE op = v_op AND modelo = v_modelo AND sobra = v_sobra;
    IF v_lote IS NOT NULL THEN
        RETURN v_lote;
    END IF;

    v_lote := prod_proximo_numero('lote');

    INSERT INTO prod_op_lote (op, modelo, sobra, lote, cliente, produto)
    VALUES (v_op, v_modelo, v_sobra, v_lote,
            nullif(btrim(coalesce(p_cliente, '')), ''),
            nullif(btrim(coalesce(p_produto, '')), ''));

    RETURN v_lote;
END;
$fn$;

-- Laudo continua so para producao normal: sobra nao e entrega.
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

    -- Sempre sobra = false: o laudo pertence a producao normal.
    v_lote := prod_lote_da_op(v_op, v_modelo, false, p_cliente, p_produto);

    SELECT coalesce(max(l.sequencia), 0) + 1 INTO v_seq
      FROM prod_op_laudo l
     WHERE l.op = v_op AND l.modelo = v_modelo AND l.sobra = false;

    v_laudo := prod_proximo_numero('laudo');

    INSERT INTO prod_op_laudo (op, modelo, sobra, laudo, sequencia, quantidade, observacao)
    VALUES (v_op, v_modelo, false, v_laudo, v_seq, p_quantidade,
            nullif(btrim(coalesce(p_observacao, '')), ''))
    RETURNING prod_op_laudo.id INTO v_id;

    RETURN QUERY SELECT v_id, v_laudo, v_seq, v_lote;
END;
$fn$;

-- Consulta do par, sem alocar nada.
CREATE OR REPLACE FUNCTION prod_dados_da_op(
    p_op     TEXT,
    p_modelo TEXT    DEFAULT '',
    p_sobra  BOOLEAN DEFAULT false
)
RETURNS TABLE (
    op         TEXT,
    modelo     TEXT,
    sobra      BOOLEAN,
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
    SELECT o.op, o.modelo, o.sobra, o.lote, o.cliente, o.produto,
           l.id, l.laudo, l.sequencia, l.quantidade, l.created_at
      FROM prod_op_lote o
      LEFT JOIN prod_op_laudo l
             ON l.op = o.op AND l.modelo = o.modelo AND l.sobra = o.sobra
     WHERE o.op     = upper(btrim(coalesce(p_op, '')))
       AND o.modelo = upper(btrim(coalesce(p_modelo, '')))
       AND o.sobra  = coalesce(p_sobra, false)
     ORDER BY l.sequencia;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Permissoes das novas assinaturas
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION prod_lote_da_op(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION prod_novo_laudo(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION prod_dados_da_op(TEXT, TEXT, BOOLEAN) TO authenticated;
