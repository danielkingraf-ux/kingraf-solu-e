-- ============================================================================
-- Etiqueta de palete: palete de escolha e bipagem na expedicao
-- Date: 2026-09-27
--
-- Pedido do Daniel:
--
-- 1. PALETE DE ESCOLHA. Material separado na colagem para escolha, que NAO
--    vai para a expedicao. A etiqueta sai marcada ESCOLHA, com numeracao
--    propria (info_extra->>'escolhaNumero': E1, E2...), nao entra no "3/10"
--    nem conta como enviado. O painel mostra a escolha a parte.
--
-- 2. BIPAGEM DA ETIQUETA NA EXPEDICAO. A etiqueta de palete ganha codigo
--    (info_extra->>'codigoPalete', ex.: 20330-PAL-001) em QR e codigo de
--    barras. Na tela de Bipagem, com a estacao no setor de expedicao, bipar
--    esse codigo registra o recebimento. O painel passa a contar como bipado
--    o palete do rastreio finalizado MAIS a etiqueta recebida.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Numero do palete de escolha unico por OP
-- ---------------------------------------------------------------------------

-- Vazio nao e numero. Ate aqui a tela gravava paleteNumero: '' em toda
-- etiqueta, e o indice antigo (WHERE info_extra ? 'paleteNumero') tratava isso
-- como numero: duas etiquetas sem numero da mesma OP batiam como repetidas.
DROP INDEX IF EXISTS prod_etiquetas_palete_numero_uk;
CREATE UNIQUE INDEX prod_etiquetas_palete_numero_uk
    ON prod_etiquetas_historico (upper(btrim(op)), (info_extra->>'paleteNumero'))
    WHERE tipo = 'pallet' AND coalesce(info_extra->>'paleteNumero', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS prod_etiquetas_escolha_numero_uk
    ON prod_etiquetas_historico (upper(btrim(op)), (info_extra->>'escolhaNumero'))
    WHERE tipo = 'pallet' AND coalesce(info_extra->>'escolhaNumero', '') <> '';

-- Acha a etiqueta pelo codigo bipado.
CREATE INDEX IF NOT EXISTS prod_etiquetas_codigo_palete_idx
    ON prod_etiquetas_historico ((info_extra->>'codigoPalete'))
    WHERE tipo = 'pallet' AND coalesce(info_extra->>'codigoPalete', '') <> '';

-- ---------------------------------------------------------------------------
-- 2. Recebimento da etiqueta na expedicao
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS prod_etiqueta_recebimentos (
    -- Uma leitura por etiqueta: bipar de novo avisa que ja entrou.
    etiqueta_id   UUID PRIMARY KEY REFERENCES prod_etiquetas_historico(id) ON DELETE CASCADE,
    codigo        TEXT NOT NULL,
    op            TEXT NOT NULL,
    setor_id      INTEGER REFERENCES rast_setores(id),
    operador_id   UUID REFERENCES rast_operadores(id),
    recebido_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS prod_etiqueta_recebimentos_op_idx ON prod_etiqueta_recebimentos (op);

COMMENT ON TABLE prod_etiqueta_recebimentos IS
    'Etiqueta de palete da colagem bipada na expedicao. So entra por rast_bipar_etiqueta_palete.';

ALTER TABLE prod_etiqueta_recebimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura prod_etiqueta_recebimentos" ON prod_etiqueta_recebimentos;
CREATE POLICY "Leitura prod_etiqueta_recebimentos" ON prod_etiqueta_recebimentos
    FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION rast_bipar_etiqueta_palete(
    p_codigo     TEXT,
    p_setor_id   INTEGER,
    p_matricula  TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_codigo  TEXT := upper(btrim(coalesce(p_codigo, '')));
    v_oper    rast_operadores;
    v_setor   rast_setores;
    v_etq     prod_etiquetas_historico;
    v_rec     prod_etiqueta_recebimentos;
    v_qtd     NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login no sistema antes de bipar.';
    END IF;

    v_oper := rast_operador_ativo(p_matricula);

    SELECT * INTO v_setor FROM rast_setores WHERE id = p_setor_id AND ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Setor da estação não encontrado. Escolha o setor no topo da tela.';
    END IF;
    IF NOT v_setor.expedicao THEN
        RAISE EXCEPTION 'A etiqueta de palete % é recebida na expedição. Esta estação está em %.', v_codigo, v_setor.nome;
    END IF;

    SELECT * INTO v_etq FROM prod_etiquetas_historico
     WHERE tipo = 'pallet' AND info_extra->>'codigoPalete' = v_codigo
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Etiqueta de palete % não encontrada. Confira o código impresso embaixo do código de barras.', v_codigo;
    END IF;

    SELECT * INTO v_rec FROM prod_etiqueta_recebimentos WHERE etiqueta_id = v_etq.id;
    IF FOUND THEN
        RAISE EXCEPTION 'Palete % já foi recebido na expedição em %. Não bipe de novo.',
            v_codigo, rast_hora_local(v_rec.recebido_em);
    END IF;

    INSERT INTO prod_etiqueta_recebimentos (etiqueta_id, codigo, op, setor_id, operador_id)
    VALUES (v_etq.id, v_codigo, upper(btrim(v_etq.op)), v_setor.id, v_oper.id);

    v_qtd := nullif(regexp_replace(coalesce(v_etq.quantidade, ''), '\D', '', 'g'), '')::NUMERIC;
    -- Mesmo formato do rast_bipar_palete: a tela de Bipagem mostra igual.
    RETURN jsonb_build_object(
        'codigo', v_codigo, 'tipo', 'finalizado', 'quantidade', coalesce(v_qtd, 0),
        'unidade', 'unidades', 'etapa', v_setor.nome, 'numero_op', upper(btrim(v_etq.op)));
END $$;

REVOKE ALL ON FUNCTION rast_bipar_etiqueta_palete(TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_bipar_etiqueta_palete(TEXT, INTEGER, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Painel: escolha a parte, bipagem conta as etiquetas recebidas
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS rast_painel_ops(INTEGER);

CREATE FUNCTION rast_painel_ops(p_limite INTEGER DEFAULT 200)
RETURNS TABLE (
    op                  TEXT,
    numero_op           TEXT,
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
    -- Bipados na expedicao: palete do rastreio finalizado + etiqueta recebida.
    paletes_expedicao   INTEGER,
    pecas_expedicao     NUMERIC,
    paletes_em_aberto   INTEGER,
    caixas_emitidas     INTEGER,
    etiquetas_palete    INTEGER,
    liberacoes          INTEGER,
    encerrada_em        TIMESTAMPTZ,
    -- Etiquetas enviadas que a expedicao ainda nao bipou, e a mais antiga.
    aguardando_bipagem  INTEGER,
    aguardando_desde    TIMESTAMPTZ,
    revisado_revisao    NUMERIC,
    aprovado_revisao    NUMERIC,
    -- Paletes de escolha: separados na colagem, nao foram para a expedicao.
    paletes_escolha     INTEGER,
    pecas_escolha       NUMERIC
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
    -- Etiquetas de palete da OP, com quantidade em numero e se ja foi recebida.
    etq AS (
        SELECT upper(btrim(h.op)) AS op, h.created_at,
               coalesce(h.info_extra->>'paleteNumero', '') <> '' AS enviado,
               coalesce(h.info_extra->>'escolhaNumero', '') <> '' AS escolha,
               coalesce(nullif(regexp_replace(coalesce(h.quantidade, ''), '\D', '', 'g'), '')::NUMERIC, 0) AS pecas,
               r.etiqueta_id IS NOT NULL AS recebido
          FROM prod_etiquetas_historico h
          LEFT JOIN prod_etiqueta_recebimentos r ON r.etiqueta_id = h.id
         WHERE h.tipo = 'pallet' AND upper(btrim(h.op)) IN (SELECT op FROM o)
    ),
    ep AS (
        SELECT op,
               count(*)::INTEGER AS etiquetas,
               count(*) FILTER (WHERE enviado)::INTEGER AS paletes,
               coalesce(sum(pecas) FILTER (WHERE enviado), 0) AS pecas,
               count(*) FILTER (WHERE enviado AND recebido)::INTEGER AS recebidos,
               coalesce(sum(pecas) FILTER (WHERE enviado AND recebido), 0) AS pecas_recebidas,
               count(*) FILTER (WHERE enviado AND NOT recebido)::INTEGER AS aguardando,
               min(created_at) FILTER (WHERE enviado AND NOT recebido) AS aguardando_desde,
               count(*) FILTER (WHERE escolha)::INTEGER AS escolha,
               coalesce(sum(pecas) FILTER (WHERE escolha), 0) AS pecas_escolha
          FROM etq GROUP BY op
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
           coalesce(pal_op.finalizados, 0) + coalesce(ep.recebidos, 0),
           coalesce(pal_op.qtd_finalizada, 0) + coalesce(ep.pecas_recebidas, 0),
           coalesce(pal_op.abertos, 0),
           coalesce(cx.caixas, 0), coalesce(ep.etiquetas, 0), coalesce(lib.n, 0),
           enc.encerrada_em,
           coalesce(ep.aguardando, 0), ep.aguardando_desde,
           rev.revisado, rev.aprovado,
           coalesce(ep.escolha, 0), coalesce(ep.pecas_escolha, 0)
      FROM o
      LEFT JOIN prod                    ON prod.op_id = o.id
      LEFT JOIN rast_clientes c         ON c.id = o.cliente_id
      LEFT JOIN prod_op_palete_plano pl ON pl.op = o.op
      LEFT JOIN pal_op                  ON pal_op.numero_op = o.numero_op
      LEFT JOIN cx                      ON cx.op = o.op
      LEFT JOIN ep                      ON ep.op = o.op
      LEFT JOIN lib                     ON lib.op = o.op
      LEFT JOIN rev                     ON rev.op = o.op
      LEFT JOIN rast_op_encerramentos enc ON enc.op = o.op
     ORDER BY o.importado_em DESC;
$$;

REVOKE ALL ON FUNCTION rast_painel_ops(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_painel_ops(INTEGER) TO authenticated;
