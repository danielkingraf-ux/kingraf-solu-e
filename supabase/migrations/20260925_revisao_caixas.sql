-- ============================================================================
-- Revisao em caixas ou unidades, e o aprovado no painel
-- Date: 2026-09-25
--
-- Pedido do Daniel: na revisao da qualidade, o revisor escolhe contar em
-- CAIXAS ou em UNIDADES, e o aprovado vai para o Painel por OP e para o
-- encerramento da OP.
--
-- quantidade_revisada / aprovada / reprovada continuam SEMPRE em unidades:
-- os relatorios de qualidade somam essas colunas entre revisoes, e misturar
-- caixa com unidade ali estragaria os relatorios. Quem conta em caixas tem o
-- numero de caixas guardado a parte, junto com a quantidade por caixa usada
-- na conversao.
-- ============================================================================

ALTER TABLE qual_revisoes
    ADD COLUMN IF NOT EXISTS unidade_contagem     TEXT NOT NULL DEFAULT 'unidades',
    ADD COLUMN IF NOT EXISTS quantidade_por_caixa NUMERIC,
    ADD COLUMN IF NOT EXISTS caixas_revisadas     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS caixas_aprovadas     INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qual_revisoes_unidade_contagem_check') THEN
        ALTER TABLE qual_revisoes
            ADD CONSTRAINT qual_revisoes_unidade_contagem_check
            CHECK (unidade_contagem IN ('unidades', 'caixas'));
    END IF;
END $$;

COMMENT ON COLUMN qual_revisoes.unidade_contagem IS
    'Como o revisor contou. As colunas quantidade_* estao sempre em unidades; em caixas, caixas_* guarda o que foi contado.';
COMMENT ON COLUMN qual_revisoes.quantidade_por_caixa IS
    'Unidades por caixa usadas para converter caixas em unidades.';

-- ---------------------------------------------------------------------------
-- Painel: revisado e aprovado na revisao (em unidades). Muda o retorno.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS rast_painel_ops(INTEGER);

CREATE FUNCTION rast_painel_ops(p_limite INTEGER DEFAULT 200)
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
    encerrada_em        TIMESTAMPTZ,
    -- Enviados que a expedicao ainda nao bipou, e desde quando o mais antigo
    -- deles espera. So faz sentido onde a expedicao bipa.
    aguardando_bipagem  INTEGER,
    aguardando_desde    TIMESTAMPTZ,
    -- Revisao da qualidade (qual_revisoes), sempre em unidades.
    revisado_revisao    NUMERIC,
    aprovado_revisao    NUMERIC
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
        SELECT prod_normaliza_op(e.op) AS op, max(greatest(e.range_start, e.range_end))::INTEGER AS caixas
          FROM prod_etiquetas_caixa e
         WHERE prod_normaliza_op(e.op) IN (SELECT op FROM o)
         GROUP BY 1
    ),
    -- Etiquetas de palete numeradas, da mais antiga para a mais nova.
    ep_linhas AS (
        SELECT upper(btrim(h.op)) AS op, h.created_at, h.quantidade,
               row_number() OVER (PARTITION BY upper(btrim(h.op)) ORDER BY h.created_at) AS ordem
          FROM prod_etiquetas_historico h
         WHERE h.tipo = 'pallet' AND h.info_extra ? 'paleteNumero'
           AND upper(btrim(h.op)) IN (SELECT op FROM o)
    ),
    ep AS (
        SELECT op, count(*)::INTEGER AS paletes,
               coalesce(sum(nullif(regexp_replace(coalesce(quantidade, ''), '\D', '', 'g'), '')::NUMERIC), 0) AS pecas
          FROM ep_linhas GROUP BY op
    ),
    ep_todas AS (
        SELECT upper(btrim(h.op)) AS op, count(*)::INTEGER AS etiquetas
          FROM prod_etiquetas_historico h
         WHERE h.tipo = 'pallet' AND upper(btrim(h.op)) IN (SELECT op FROM o)
         GROUP BY 1
    ),
    lib AS (
        SELECT l.op, count(*)::INTEGER AS n FROM rast_liberacoes l
         WHERE l.op IN (SELECT op FROM o) GROUP BY l.op
    ),
    rev AS (
        SELECT prod_normaliza_op(q.op) AS op,
               sum(q.quantidade_revisada)::NUMERIC AS revisado,
               sum(q.quantidade_aprovada)::NUMERIC AS aprovado
          FROM qual_revisoes q
         WHERE prod_normaliza_op(q.op) IN (SELECT op FROM o)
         GROUP BY 1
    )
    SELECT o.op, o.numero_op, o.descricao, c.nome, o.pedido, o.entrega_prevista, o.importado_em,
           coalesce(prod.modelos, 0), prod.qtd,
           pl.quantidade_por_caixa, pl.caixas_por_pallet,
           coalesce(pal_op.setores, '[]'::JSONB),
           coalesce(ep.paletes, 0), coalesce(ep.pecas, 0),
           coalesce(pal_op.finalizados, 0), coalesce(pal_op.qtd_finalizada, 0),
           coalesce(pal_op.abertos, 0),
           coalesce(cx.caixas, 0), coalesce(ep_todas.etiquetas, 0), coalesce(lib.n, 0),
           enc.encerrada_em,
           greatest(coalesce(ep.paletes, 0) - coalesce(pal_op.finalizados, 0), 0),
           -- O (bipados + 1)-esimo enviado e o mais antigo ainda sem bipagem.
           (SELECT l.created_at FROM ep_linhas l
             WHERE l.op = o.op AND l.ordem = coalesce(pal_op.finalizados, 0) + 1),
           rev.revisado, rev.aprovado
      FROM o
      LEFT JOIN prod                    ON prod.op_id = o.id
      LEFT JOIN rast_clientes c         ON c.id = o.cliente_id
      LEFT JOIN prod_op_palete_plano pl ON pl.op = o.op
      LEFT JOIN pal_op                  ON pal_op.numero_op = o.numero_op
      LEFT JOIN cx                      ON cx.op = o.op
      LEFT JOIN ep                      ON ep.op = o.op
      LEFT JOIN ep_todas                ON ep_todas.op = o.op
      LEFT JOIN lib                     ON lib.op = o.op
      LEFT JOIN rev                     ON rev.op = o.op
      LEFT JOIN rast_op_encerramentos enc ON enc.op = o.op
     ORDER BY o.importado_em DESC;
$$;

REVOKE ALL ON FUNCTION rast_painel_ops(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_painel_ops(INTEGER) TO authenticated;

-- Encerrar: a revisao aprovar menos que a OP tambem e "a menos".
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
            OR (v_prev_caixas IS NOT NULL AND v_linha.caixas_emitidas > 0
                AND v_linha.caixas_emitidas < v_prev_caixas)
            -- A revisao aprovou menos que a OP pede.
            OR (v_linha.qtd_op IS NOT NULL AND coalesce(v_linha.revisado_revisao, 0) > 0
                AND v_linha.aprovado_revisao < v_linha.qtd_op);

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
