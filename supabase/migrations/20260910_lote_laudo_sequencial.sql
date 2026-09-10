-- ============================================================================
-- Lote e Laudo sequenciais presos a Ordem de Producao
--
-- Regra de negocio:
--   * LOTE  -> um por OP. Alocado na primeira vez que a OP aparece e reusado
--              para sempre. Reimpressao nunca gera numero novo.
--   * LAUDO -> um por ENTREGA da OP. Uma OP entregue parcialmente tem varios
--              laudos (1a entrega, 2a entrega...), cada um com seu numero.
--
-- A alocacao acontece no banco, dentro da transacao, com trava por OP. Isso
-- elimina a duplicacao que acontecia quando dois operadores digitavam o numero
-- a mao ao mesmo tempo. Os contadores sao gapless: se a transacao falhar, o
-- numero volta (ao contrario de uma SEQUENCE, que deixa buraco).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Contadores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prod_contadores (
    nome        TEXT PRIMARY KEY,
    valor       BIGINT NOT NULL,
    atualizado  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE prod_contadores IS
    'Contadores sequenciais gapless. valor = ultimo numero JA emitido.';

-- Continuidade com o sistema atual: ultima etiqueta emitida tinha
-- lote 85550 e laudo 42133. Proximos = 85551 e 42134.
INSERT INTO prod_contadores (nome, valor) VALUES
    ('lote',  85550),
    ('laudo', 42133)
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Lote preso a OP (1:1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prod_op_lote (
    op          TEXT PRIMARY KEY,
    lote        BIGINT NOT NULL UNIQUE,
    cliente     TEXT,
    produto     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID DEFAULT auth.uid()
);

COMMENT ON TABLE prod_op_lote IS
    'Vinculo permanente OP -> lote. Uma linha por OP, criada na primeira geracao.';

-- ---------------------------------------------------------------------------
-- 3. Laudo por entrega da OP (1:N)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prod_op_laudo (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    op          TEXT NOT NULL REFERENCES prod_op_lote(op) ON UPDATE CASCADE,
    laudo       BIGINT NOT NULL UNIQUE,
    sequencia   INTEGER NOT NULL,
    quantidade  NUMERIC,
    observacao  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID DEFAULT auth.uid(),
    UNIQUE (op, sequencia)
);

COMMENT ON TABLE prod_op_laudo IS
    'Um laudo por entrega da OP. sequencia = 1a, 2a, 3a entrega daquela OP.';

CREATE INDEX IF NOT EXISTS idx_op_laudo_op ON prod_op_laudo (op);

-- ---------------------------------------------------------------------------
-- 4. Ligacao da etiqueta impressa com o laudo que ela carrega
-- ---------------------------------------------------------------------------
ALTER TABLE prod_etiquetas_caixa
    ADD COLUMN IF NOT EXISTS laudo_id UUID REFERENCES prod_op_laudo(id);

CREATE INDEX IF NOT EXISTS idx_etiquetas_caixa_laudo_id
    ON prod_etiquetas_caixa (laudo_id);

-- ---------------------------------------------------------------------------
-- 5. Funcao base: proximo numero de um contador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prod_proximo_numero(p_nome TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_valor BIGINT;
BEGIN
    -- UPDATE ... RETURNING trava a linha: chamadas concorrentes enfileiram.
    UPDATE prod_contadores
       SET valor = valor + 1,
           atualizado = now()
     WHERE nome = p_nome
    RETURNING valor INTO v_valor;

    IF v_valor IS NULL THEN
        RAISE EXCEPTION 'Contador "%" nao existe', p_nome;
    END IF;

    RETURN v_valor;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Lote da OP: devolve o existente ou aloca o primeiro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prod_lote_da_op(
    p_op      TEXT,
    p_cliente TEXT DEFAULT NULL,
    p_produto TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_op   TEXT := upper(btrim(coalesce(p_op, '')));
    v_lote BIGINT;
BEGIN
    IF v_op = '' THEN
        RAISE EXCEPTION 'OP obrigatoria para gerar lote';
    END IF;

    -- Trava por OP ate o fim da transacao: duas telas abrindo a mesma OP
    -- ao mesmo tempo nao alocam dois lotes.
    PERFORM pg_advisory_xact_lock(hashtextextended('prod_op_lote:' || v_op, 0));

    SELECT lote INTO v_lote FROM prod_op_lote WHERE op = v_op;
    IF v_lote IS NOT NULL THEN
        RETURN v_lote;
    END IF;

    v_lote := prod_proximo_numero('lote');

    INSERT INTO prod_op_lote (op, lote, cliente, produto)
    VALUES (v_op, v_lote, nullif(btrim(coalesce(p_cliente, '')), ''),
                          nullif(btrim(coalesce(p_produto, '')), ''));

    RETURN v_lote;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Novo laudo: uma entrega da OP
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prod_novo_laudo(
    p_op         TEXT,
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
    v_op    TEXT := upper(btrim(coalesce(p_op, '')));
    v_lote  BIGINT;
    v_laudo BIGINT;
    v_seq   INTEGER;
    v_id    UUID;
BEGIN
    IF v_op = '' THEN
        RAISE EXCEPTION 'OP obrigatoria para gerar laudo';
    END IF;

    -- Garante o lote da OP (cria se for a primeira vez) e trava a OP.
    v_lote := prod_lote_da_op(v_op, p_cliente, p_produto);

    SELECT coalesce(max(l.sequencia), 0) + 1 INTO v_seq
      FROM prod_op_laudo l WHERE l.op = v_op;

    v_laudo := prod_proximo_numero('laudo');

    INSERT INTO prod_op_laudo (op, laudo, sequencia, quantidade, observacao)
    VALUES (v_op, v_laudo, v_seq, p_quantidade,
            nullif(btrim(coalesce(p_observacao, '')), ''))
    RETURNING prod_op_laudo.id INTO v_id;

    RETURN QUERY SELECT v_id, v_laudo, v_seq, v_lote;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. Consulta: tudo que a tela precisa de uma OP, sem alocar nada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prod_dados_da_op(p_op TEXT)
RETURNS TABLE (
    op         TEXT,
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
    SELECT o.op, o.lote, o.cliente, o.produto,
           l.id, l.laudo, l.sequencia, l.quantidade, l.created_at
      FROM prod_op_lote o
      LEFT JOIN prod_op_laudo l ON l.op = o.op
     WHERE o.op = upper(btrim(coalesce(p_op, '')))
     ORDER BY l.sequencia;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. Backfill do historico: preserva vinculos que ja foram impressos
--    Importa (op, lote) e (op, laudo) das etiquetas antigas, ignorando valores
--    nao numericos e qualquer numero acima dos contadores atuais.
-- ---------------------------------------------------------------------------
INSERT INTO prod_op_lote (op, lote, cliente, produto, created_at)
SELECT DISTINCT ON (e.lote::BIGINT)
       upper(btrim(e.op)), e.lote::BIGINT, e.cliente, e.produto, e.created_at
  FROM prod_etiquetas_caixa e
 WHERE btrim(coalesce(e.op, '')) <> ''
   AND e.lote ~ '^[0-9]+$'
   AND e.lote::BIGINT <= 85550
 ORDER BY e.lote::BIGINT, e.created_at
ON CONFLICT DO NOTHING;

INSERT INTO prod_op_laudo (op, laudo, sequencia, created_at)
SELECT op, laudo, row_number() OVER (PARTITION BY op ORDER BY created_at), created_at
  FROM (
      SELECT DISTINCT ON (e.laudo::BIGINT)
             upper(btrim(e.op)) AS op, e.laudo::BIGINT AS laudo, e.created_at
        FROM prod_etiquetas_caixa e
       WHERE btrim(coalesce(e.op, '')) <> ''
         AND e.laudo ~ '^[0-9]+$'
         AND e.laudo::BIGINT <= 42133
         AND upper(btrim(e.op)) IN (SELECT op FROM prod_op_lote)
       ORDER BY e.laudo::BIGINT, e.created_at
  ) d
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Permissoes
--     Leitura livre para autenticados; escrita SOMENTE pelas funcoes acima,
--     para que ninguem edite um numero ja emitido pela tela ou pela API.
-- ---------------------------------------------------------------------------
ALTER TABLE prod_contadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_op_lote    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_op_laudo   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de lotes para autenticados" ON prod_op_lote;
CREATE POLICY "Leitura de lotes para autenticados"
    ON prod_op_lote FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Leitura de laudos para autenticados" ON prod_op_laudo;
CREATE POLICY "Leitura de laudos para autenticados"
    ON prod_op_laudo FOR SELECT TO authenticated USING (true);

-- prod_contadores fica sem policy: RLS ligado e nenhuma policy = ninguem le
-- nem escreve direto. So as funcoes SECURITY DEFINER enxergam.

REVOKE ALL ON prod_contadores FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON prod_op_lote  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON prod_op_laudo FROM anon, authenticated;
GRANT SELECT ON prod_op_lote, prod_op_laudo TO authenticated;

REVOKE ALL ON FUNCTION prod_proximo_numero(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION prod_lote_da_op(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION prod_novo_laudo(TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION prod_dados_da_op(TEXT) TO authenticated;
