-- ============================================================================
-- Piloto colagem -> expedicao
-- Date: 2026-09-24
--
-- Combinado com o Daniel: no piloto, IMPRIMIR A ETIQUETA DE PALETE na colagem
-- conta como palete que saiu da colagem para a expedicao. O numero do palete
-- ("3" de "3/10") e a sequencia das etiquetas de palete da OP, gravada em
-- prod_etiquetas_historico.info_extra->>'paleteNumero'.
--
-- A bipagem da expedicao no rastreio continua ativa e e contada a parte
-- (paletes finalizados), para comparar o que saiu com o que foi bipado.
--
-- 1. Indice unico: duas estacoes imprimindo a mesma OP ao mesmo tempo nao
--    podem gravar o mesmo numero de palete. A segunda leva erro e a tela
--    tenta de novo com o proximo numero.
-- 2. rast_painel_ops: paletes_colagem / pecas_colagem passam a vir das
--    etiquetas de palete numeradas. paletes_expedicao / pecas_expedicao
--    continuam sendo a bipagem da expedicao no rastreio.
-- 3. rast_encerrar_op: "a menos" compara a OP com o que saiu da colagem.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Numero de palete unico por OP
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS prod_etiquetas_palete_numero_uk
    ON prod_etiquetas_historico (upper(btrim(op)), (info_extra->>'paleteNumero'))
    WHERE tipo = 'pallet' AND info_extra ? 'paleteNumero';

-- ---------------------------------------------------------------------------
-- 2. Painel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_painel_ops(p_limite INTEGER DEFAULT 200)
RETURNS TABLE (
    op                  TEXT,
    numero_op           INTEGER,
    descricao           TEXT,
    cliente             TEXT,
    pedido              TEXT,
    entrega_prevista    DATE,
    importado_em        TIMESTAMPTZ,
    modelos             INTEGER,
    qtd_op              NUMERIC,
    qtd_por_caixa       NUMERIC,
    caixas_por_pallet   INTEGER,
    setores             JSONB,
    -- Etiquetas de palete numeradas: sairam da colagem para a expedicao.
    paletes_colagem     INTEGER,
    pecas_colagem       NUMERIC,
    -- Bipagem da expedicao no rastreio (palete finalizado).
    paletes_expedicao   INTEGER,
    pecas_expedicao     NUMERIC,
    paletes_em_aberto   INTEGER,
    caixas_emitidas     INTEGER,
    etiquetas_palete    INTEGER,
    liberacoes          INTEGER,
    encerrada_em        TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH o AS (
        SELECT r.id, r.numero_op, r.numero_op::TEXT AS op, r.descricao, r.pedido,
               r.entrega_prevista, r.importado_em, r.cliente_id
          FROM rast_ops r
         WHERE r.ativa
         ORDER BY r.importado_em DESC
         LIMIT p_limite
    ),
    prod AS (
        SELECT op_id, count(*)::INTEGER AS modelos, sum(quantidade) AS qtd
          FROM rast_op_produtos WHERE op_id IN (SELECT id FROM o) GROUP BY op_id
    ),
    pal AS (
        SELECT p.numero_op, s.sigla, s.nome, s.ordem,
               count(*)::INTEGER AS paletes,
               sum(p.quantidade) AS qtd,
               count(*) FILTER (WHERE p.situacao IN ('aguardando', 'em_terceiros'))::INTEGER AS abertos,
               count(*) FILTER (WHERE p.situacao = 'finalizado')::INTEGER AS finalizados,
               coalesce(sum(p.quantidade) FILTER (WHERE p.situacao = 'finalizado'), 0) AS qtd_finalizada,
               min(p.unidade) AS unidade
          FROM rast_paletes p
          JOIN rast_setores s ON s.id = p.setor_origem_id
         WHERE p.situacao <> 'cancelado'
           AND p.numero_op IN (SELECT numero_op FROM o)
         GROUP BY p.numero_op, s.sigla, s.nome, s.ordem
    ),
    pal_op AS (
        SELECT numero_op,
               jsonb_agg(jsonb_build_object(
                   'sigla', sigla, 'nome', nome, 'paletes', paletes, 'quantidade', qtd,
                   'abertos', abertos, 'unidade', unidade) ORDER BY ordem) AS setores,
               sum(abertos)::INTEGER AS abertos,
               sum(finalizados)::INTEGER AS finalizados,
               sum(qtd_finalizada) AS qtd_finalizada
          FROM pal GROUP BY numero_op
    ),
    cx AS (
        SELECT upper(btrim(e.op)) AS op, max(greatest(e.range_start, e.range_end))::INTEGER AS caixas
          FROM prod_etiquetas_caixa e
         WHERE upper(btrim(e.op)) IN (SELECT op FROM o)
         GROUP BY 1
    ),
    ep AS (
        SELECT upper(btrim(h.op)) AS op,
               count(*)::INTEGER AS etiquetas,
               count(*) FILTER (WHERE h.info_extra ? 'paleteNumero')::INTEGER AS paletes,
               -- quantidade e texto na tabela antiga; so digitos contam.
               coalesce(sum(nullif(regexp_replace(coalesce(h.quantidade, ''), '\D', '', 'g'), '')::NUMERIC)
                        FILTER (WHERE h.info_extra ? 'paleteNumero'), 0) AS pecas
          FROM prod_etiquetas_historico h
         WHERE h.tipo = 'pallet' AND upper(btrim(h.op)) IN (SELECT op FROM o)
         GROUP BY 1
    ),
    lib AS (
        SELECT l.op, count(*)::INTEGER AS n FROM rast_liberacoes l
         WHERE l.op IN (SELECT op FROM o) GROUP BY l.op
    )
    SELECT o.op, o.numero_op, o.descricao, c.nome, o.pedido, o.entrega_prevista, o.importado_em,
           coalesce(prod.modelos, 0), prod.qtd,
           pl.quantidade_por_caixa, pl.caixas_por_pallet,
           coalesce(pal_op.setores, '[]'::JSONB),
           coalesce(ep.paletes, 0), coalesce(ep.pecas, 0),
           coalesce(pal_op.finalizados, 0), coalesce(pal_op.qtd_finalizada, 0),
           coalesce(pal_op.abertos, 0),
           coalesce(cx.caixas, 0), coalesce(ep.etiquetas, 0), coalesce(lib.n, 0),
           enc.encerrada_em
      FROM o
      LEFT JOIN prod                    ON prod.op_id = o.id
      LEFT JOIN rast_clientes c         ON c.id = o.cliente_id
      LEFT JOIN prod_op_palete_plano pl ON pl.op = o.op
      LEFT JOIN pal_op                  ON pal_op.numero_op = o.numero_op
      LEFT JOIN cx                      ON cx.op = o.op
      LEFT JOIN ep                      ON ep.op = o.op
      LEFT JOIN lib                     ON lib.op = o.op
      LEFT JOIN rast_op_encerramentos enc ON enc.op = o.op
     ORDER BY o.importado_em DESC;
$$;

-- ---------------------------------------------------------------------------
-- 3. Encerrar: "a menos" e contra o que saiu da colagem
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_encerrar_op(p_op TEXT, p_liberacao_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_op     TEXT := upper(btrim(coalesce(p_op, '')));
    v_linha  RECORD;
    v_falta  BOOLEAN;
    v_prev_caixas NUMERIC;
BEGIN
    IF NOT rast_eh_admin() THEN
        RAISE EXCEPTION 'Só a conta de administração encerra OP.';
    END IF;

    SELECT * INTO v_linha FROM rast_painel_ops(100000) p WHERE p.op = v_op;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'OP % não está no rastreio.', v_op;
    END IF;
    IF v_linha.encerrada_em IS NOT NULL THEN
        RAISE EXCEPTION 'OP % já está encerrada.', v_op;
    END IF;

    v_prev_caixas := CASE WHEN v_linha.qtd_op IS NOT NULL AND v_linha.qtd_por_caixa > 0
                          THEN ceil(v_linha.qtd_op / v_linha.qtd_por_caixa) END;
    v_falta := (v_linha.qtd_op IS NOT NULL AND v_linha.pecas_colagem < v_linha.qtd_op)
            OR (v_prev_caixas IS NOT NULL AND v_linha.caixas_emitidas < v_prev_caixas);

    IF v_falta AND NOT EXISTS (
        SELECT 1 FROM rast_liberacoes l
         WHERE l.id = p_liberacao_id AND l.op = v_op AND l.tipo = 'encerrar_op'
           AND l.created_at > now() - interval '15 minutes'
    ) THEN
        RAISE EXCEPTION 'OP % está abaixo do previsto. Encerrar precisa da matrícula de um supervisor.', v_op;
    END IF;

    INSERT INTO rast_op_encerramentos (op, liberacao_id, resumo)
    VALUES (v_op, CASE WHEN v_falta THEN p_liberacao_id END, to_jsonb(v_linha));
END $$;
