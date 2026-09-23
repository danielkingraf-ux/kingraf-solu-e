-- ============================================================================
-- Numero da OP como texto: OP de reimpressao (20363_01)
-- Date: 2026-09-26
--
-- A reimpressao vem do Metrics como OP propria, com o numero no Code do
-- servico: <plnWS Code="20363_01" ExtRef="20363_01">, arquivo PLN20363_01.xml.
-- Combinado com o Daniel: e uma OP SEPARADA, com paletes numerados do 1 e
-- fechamento proprio. Codigo do palete: 20363_01-COL-001.
--
-- numero_op era INTEGER em rast_ops e rast_paletes. Vira TEXT. As OPs que ja
-- existem continuam iguais (20418 vira '20418').
--
-- Recria so o que dependia do numero ser inteiro:
--   - rast_fila_entrada, rast_saldo_entrada, rast_alocar (parametro da OP);
--   - rast_fechamento_op (parametro da OP);
--   - rast_importar_op (lia o numero como inteiro). A versao nova junta as
--     duas de 21/09: cliente e quantidade aprovada (cliente_produto) mais
--     id_wo e descricao (numero_op), que tinham ficado em arquivos separados;
--   - rast_painel_ops (devolvia numero_op INTEGER);
--   - prod_trava_etiqueta_caixa (so procurava OP so de digitos).
-- rast_criar_paletes e rast_bipar_palete nao mudam: ja montam e procuram o
-- codigo como texto.
-- ============================================================================

ALTER TABLE rast_ops    ALTER COLUMN numero_op TYPE TEXT USING numero_op::TEXT;
ALTER TABLE rast_paletes ALTER COLUMN numero_op TYPE TEXT USING numero_op::TEXT;

COMMENT ON COLUMN rast_ops.numero_op IS
    'Numero da OP na fabrica: Code do plnWS, igual ao nome do arquivo PLNxxxxx.xml. Texto: reimpressao vem como 20363_01.';

-- As versoes com INTEGER deixam de servir: text = integer nao compara.
DROP FUNCTION IF EXISTS rast_alocar(UUID, INTEGER, INTEGER, NUMERIC, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS rast_saldo_entrada(INTEGER, INTEGER, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS rast_fila_entrada(INTEGER, INTEGER, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS rast_fechamento_op(INTEGER);

-- ---------------------------------------------------------------------------
-- Alocacao (corpo igual ao de 20260919_rastreio_palete.sql)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_fila_entrada(
    p_numero_op  TEXT,
    p_setor_id   INTEGER,
    p_unidade    TEXT,
    p_poses      NUMERIC
) RETURNS TABLE (origem_id UUID, disponivel NUMERIC, fator NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id,
           e.quantidade - coalesce((SELECT sum(a.quantidade) FROM rast_alocacoes a
                                     WHERE a.origem_id = p.id AND NOT a.estornado), 0),
           CASE WHEN p.unidade = 'folhas' AND p_unidade = 'unidades' THEN p_poses ELSE 1 END
      FROM rast_palete_eventos e
      JOIN rast_paletes p    ON p.id = e.palete_id
      JOIN rast_op_roteiro r ON r.id = e.etapa_id
     WHERE e.tipo = 'consumido'
       AND p.numero_op = p_numero_op
       AND r.setor_id = p_setor_id
     ORDER BY e.ocorrido_em, e.id;
$$;

CREATE OR REPLACE FUNCTION rast_saldo_entrada(
    p_numero_op  TEXT,
    p_setor_id   INTEGER,
    p_unidade    TEXT,
    p_poses      NUMERIC
) RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(sum(greatest(disponivel, 0) * fator), 0)
      FROM rast_fila_entrada(p_numero_op, p_setor_id, p_unidade, p_poses);
$$;

CREATE OR REPLACE FUNCTION rast_alocar(
    p_palete_id  UUID,
    p_numero_op  TEXT,
    p_setor_id   INTEGER,
    p_qtd        NUMERIC,
    p_unidade    TEXT,
    p_poses      NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_falta  NUMERIC := p_qtd;
    v_tira   NUMERIC;
    f        RECORD;
BEGIN
    FOR f IN SELECT * FROM rast_fila_entrada(p_numero_op, p_setor_id, p_unidade, p_poses) LOOP
        EXIT WHEN v_falta <= 0;
        CONTINUE WHEN f.disponivel <= 0;
        v_tira := least(f.disponivel * f.fator, v_falta);
        INSERT INTO rast_alocacoes (origem_id, palete_id, quantidade)
        VALUES (f.origem_id, p_palete_id, round(v_tira / f.fator, 4));
        v_falta := v_falta - v_tira;
    END LOOP;
    IF v_falta > 0.0001 THEN
        RAISE EXCEPTION 'Faltou material de entrada para alocar (% %). Bipe os paletes de entrada e tente de novo.', v_falta, p_unidade;
    END IF;
END $$;

REVOKE ALL ON FUNCTION rast_fila_entrada(TEXT, INTEGER, TEXT, NUMERIC)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_saldo_entrada(TEXT, INTEGER, TEXT, NUMERIC)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_saldo_entrada(TEXT, INTEGER, TEXT, NUMERIC)      TO authenticated;
REVOKE ALL ON FUNCTION rast_alocar(UUID, TEXT, INTEGER, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fechamento da OP (corpo igual ao de 20260925_controles_piloto.sql)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_fechamento_op(p_numero_op TEXT)
RETURNS TABLE (
    setor_id           INTEGER,
    setor              TEXT,
    sigla              TEXT,
    planejado          NUMERIC,
    refugo_previsto    NUMERIC,
    entrada            NUMERIC,
    entrada_paletes    INTEGER,
    entrada_unidade    TEXT,
    ja_lancado         NUMERIC,
    falta_lancar       NUMERIC,
    saida              NUMERIC,
    saida_paletes      INTEGER,
    saida_unidade      TEXT,
    refugo             NUMERIC,
    em_aberto          NUMERIC,
    em_aberto_paletes  INTEGER,
    operadores         TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH ent AS (
        -- 'finalizado' e a expedicao recebendo: vem sem etapa quando o palete
        -- ja passou por todo o roteiro, e ai e da expedicao. Nao vira palete
        -- novo, entao conta como todo lancado.
        SELECT coalesce(r.setor_id,
                        (SELECT s.id FROM rast_setores s WHERE s.expedicao ORDER BY s.ordem LIMIT 1)) AS setor_id,
               sum(e.quantidade) AS qtd,
               count(*)::INTEGER AS paletes,
               min(p.unidade) AS unidade,
               coalesce(sum(CASE WHEN e.tipo = 'finalizado' THEN e.quantidade
                                 ELSE (SELECT sum(a.quantidade) FROM rast_alocacoes a
                                        WHERE a.origem_id = p.id AND NOT a.estornado) END), 0) AS usado
          FROM rast_palete_eventos e
          JOIN rast_paletes p         ON p.id = e.palete_id
          LEFT JOIN rast_op_roteiro r ON r.id = e.etapa_id
         WHERE e.tipo IN ('consumido', 'finalizado') AND p.numero_op = p_numero_op
         GROUP BY 1
    ),
    sai AS (
        SELECT p.setor_origem_id AS setor_id,
               sum(p.quantidade) AS qtd,
               count(*)::INTEGER AS paletes,
               min(p.unidade) AS unidade,
               array_agg(DISTINCT o.matricula || ' ' || o.nome) AS operadores,
               coalesce(sum(p.quantidade) FILTER (WHERE p.situacao IN ('aguardando', 'em_terceiros')), 0) AS aberto,
               count(*) FILTER (WHERE p.situacao IN ('aguardando', 'em_terceiros'))::INTEGER AS aberto_paletes
          FROM rast_paletes p
          JOIN rast_operadores o ON o.id = p.operador_id
         WHERE p.numero_op = p_numero_op AND p.situacao <> 'cancelado'
         GROUP BY p.setor_origem_id
    ),
    ref AS (
        SELECT p.setor_origem_id AS setor_id, sum(e.refugo) AS refugo
          FROM rast_palete_eventos e
          JOIN rast_paletes p ON p.id = e.palete_id
         WHERE e.tipo = 'criado' AND p.numero_op = p_numero_op AND p.situacao <> 'cancelado'
         GROUP BY p.setor_origem_id
    ),
    ref_terceiros AS (
        SELECT r.setor_id, sum(e.refugo) AS refugo
          FROM rast_palete_eventos e
          JOIN rast_paletes p    ON p.id = e.palete_id
          JOIN rast_op_roteiro r ON r.id = e.etapa_id
         WHERE e.tipo = 'retorno_terceiros' AND p.numero_op = p_numero_op
         GROUP BY r.setor_id
    ),
    plano AS (
        SELECT DISTINCT ON (r.setor_id)
               r.setor_id, r.qtd_planejada,
               coalesce(r.refugo_acerto, 0) + coalesce(r.refugo_rodagem, 0) AS refugo_previsto
          FROM rast_op_roteiro r
          JOIN rast_ops o ON o.id = r.op_id
         WHERE o.numero_op = p_numero_op AND o.ativa
           AND r.movimenta_palete AND r.setor_id IS NOT NULL
         ORDER BY r.setor_id, r.seq
    )
    SELECT s.id, s.nome, s.sigla,
           plano.qtd_planejada,
           plano.refugo_previsto,
           coalesce(ent.qtd, 0), coalesce(ent.paletes, 0), ent.unidade,
           coalesce(ent.usado, 0), coalesce(ent.qtd, 0) - coalesce(ent.usado, 0),
           coalesce(sai.qtd, 0), coalesce(sai.paletes, 0), sai.unidade,
           coalesce(ref.refugo, 0) + coalesce(ref_terceiros.refugo, 0),
           coalesce(sai.aberto, 0), coalesce(sai.aberto_paletes, 0),
           coalesce(sai.operadores, '{}')
      FROM rast_setores s
      LEFT JOIN ent           ON ent.setor_id = s.id
      LEFT JOIN sai           ON sai.setor_id = s.id
      LEFT JOIN ref           ON ref.setor_id = s.id
      LEFT JOIN ref_terceiros ON ref_terceiros.setor_id = s.id
      LEFT JOIN plano         ON plano.setor_id = s.id
     WHERE ent.setor_id IS NOT NULL
        OR sai.setor_id IS NOT NULL
        OR plano.setor_id IS NOT NULL
     ORDER BY s.ordem;
$$;

REVOKE ALL ON FUNCTION rast_fechamento_op(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_fechamento_op(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Importacao: numero da OP em texto, com cliente, id_wo e descricao
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_importar_op(
    p_op        JSONB,
    p_roteiro   JSONB,
    p_produtos  JSONB,
    p_arquivo   TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    -- Texto: a reimpressao vem como 20363_01 no Code do XML.
    v_numero  TEXT    := nullif(upper(btrim(coalesce(p_op->>'numero_op', ''))), '');
    v_versao  TEXT    := coalesce(p_op->>'versao_xml', '');
    v_cliente INTEGER := nullif(p_op->>'cliente_id', '')::INTEGER;
    v_op_id   UUID;
    v_item    JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login para importar.';
    END IF;
    IF NOT rast_eh_admin() THEN
        RAISE EXCEPTION 'Esta conta é de operação e não importa OP. Entre com a conta de administração, ou peça ao PCP.';
    END IF;
    IF v_numero IS NULL THEN
        RAISE EXCEPTION 'O XML não tem o número da OP. Confira se o arquivo é o planejamento exportado do Metrics.';
    END IF;
    IF jsonb_array_length(coalesce(p_roteiro, '[]')) = 0 THEN
        RAISE EXCEPTION 'O roteiro da OP % veio vazio. Confira o XML antes de importar.', v_numero;
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_roteiro) e
         WHERE (e->>'movimenta_palete')::BOOLEAN AND nullif(e->>'setor_id', '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Toda etapa que movimenta palete precisa de setor. Escolha o setor nas linhas em branco.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('rast_op_' || v_numero));

    IF EXISTS (SELECT 1 FROM rast_ops WHERE numero_op = v_numero AND versao_xml = v_versao) THEN
        RAISE EXCEPTION 'A OP % versão % já foi importada. Para mudar o roteiro, exporte a versão nova no Metrics.',
            v_numero, nullif(v_versao, '');
    END IF;

    -- cliente novo entra sem nome, para o PCP batizar depois
    IF v_cliente IS NOT NULL THEN
        INSERT INTO rast_clientes (id) VALUES (v_cliente) ON CONFLICT (id) DO NOTHING;
    END IF;

    UPDATE rast_ops SET ativa = false WHERE numero_op = v_numero AND ativa;

    INSERT INTO rast_ops (numero_op, id_wo, descricao, cliente_id, pedido, versao_xml,
                          entrega_prevista, inicio_minimo, status_erp, arquivo_origem)
    VALUES (
        v_numero,
        nullif(p_op->>'id_wo', '')::INTEGER,
        nullif(p_op->>'descricao', ''),
        v_cliente,
        p_op->>'pedido',
        v_versao,
        nullif(left(p_op->>'entrega_prevista', 10), '')::DATE,
        p_op->>'inicio_minimo',
        p_op->>'status_erp',
        p_arquivo
    )
    RETURNING id INTO v_op_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_roteiro) LOOP
        INSERT INTO rast_op_roteiro (
            op_id, seq, processo, setor_id, movimenta_palete, terceiros, alerta_terceiros,
            qtd_planejada, refugo_acerto, refugo_rodagem, velocidade, tempo_acerto_min, poses_por_ciclo
        ) VALUES (
            v_op_id,
            (v_item->>'seq')::INTEGER,
            v_item->>'processo',
            nullif(v_item->>'setor_id', '')::INTEGER,
            coalesce((v_item->>'movimenta_palete')::BOOLEAN, true),
            coalesce((v_item->>'terceiros')::BOOLEAN, false),
            coalesce((v_item->>'alerta_terceiros')::BOOLEAN, false),
            nullif(v_item->>'qtd_planejada', '')::NUMERIC,
            nullif(v_item->>'refugo_acerto', '')::NUMERIC,
            nullif(v_item->>'refugo_rodagem', '')::NUMERIC,
            nullif(v_item->>'velocidade', '')::NUMERIC,
            nullif(v_item->>'tempo_acerto_min', '')::NUMERIC,
            nullif(v_item->>'poses_por_ciclo', '')::NUMERIC
        );
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_produtos, '[]')) LOOP
        INSERT INTO rast_op_produtos (op_id, codigo, descricao, quantidade, qtd_aprovada, unidade_id)
        VALUES (
            v_op_id,
            v_item->>'codigo',
            v_item->>'descricao',
            nullif(v_item->>'quantidade', '')::NUMERIC,
            nullif(v_item->>'qtd_aprovada', '')::NUMERIC,
            nullif(v_item->>'unidade_id', '')::INTEGER
        );
    END LOOP;

    RETURN v_op_id;
END $$;

REVOKE ALL ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Painel: numero_op volta como texto (muda o retorno, precisa DROP)
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

-- ---------------------------------------------------------------------------
-- Trava da etiqueta de caixa: acha a OP no rastreio tambem com _01
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prod_trava_etiqueta_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_op        TEXT := prod_normaliza_op(NEW.op);
    v_king      TEXT := upper(btrim(coalesce(NEW.numero_interno, '')));
    v_ultima    INTEGER := greatest(coalesce(NEW.range_start, 0), coalesce(NEW.range_end, 0));
    v_por_caixa NUMERIC := nullif(regexp_replace(coalesce(NEW.quantidade, ''), '\D', '', 'g'), '')::NUMERIC;
    v_op_id     UUID;
    v_qtd       NUMERIC;
    v_prev      NUMERIC;
BEGIN
    -- So a faixa ou a quantidade por caixa mudam o previsto x emitido.
    IF TG_OP = 'UPDATE'
       AND OLD.range_start IS NOT DISTINCT FROM NEW.range_start
       AND OLD.range_end IS NOT DISTINCT FROM NEW.range_end
       AND OLD.quantidade IS NOT DISTINCT FROM NEW.quantidade THEN
        RETURN NEW;
    END IF;
    IF coalesce(v_por_caixa, 0) <= 0 OR v_op = '' THEN
        RETURN NEW;
    END IF;

    -- Quantidade da OP, como a tela: o modelo cujo codigo bate com o KING,
    -- senao o unico modelo, senao a soma; fora do rastreio, a conta da OP.
    -- numero_op e texto: vale para 20418 e para a reimpressao 20363_01.
    SELECT id INTO v_op_id FROM rast_ops WHERE numero_op = v_op AND ativa;
    IF v_op_id IS NOT NULL THEN
        IF v_king <> '' THEN
            SELECT quantidade INTO v_qtd FROM rast_op_produtos
             WHERE op_id = v_op_id AND quantidade IS NOT NULL
               AND position(v_king IN upper(coalesce(descricao, codigo, ''))) > 0
             LIMIT 1;
        END IF;
        IF v_qtd IS NULL THEN
            SELECT CASE WHEN count(*) = 1 THEN max(quantidade) ELSE sum(quantidade) END INTO v_qtd
              FROM rast_op_produtos WHERE op_id = v_op_id AND quantidade IS NOT NULL;
        END IF;
    ELSE
        SELECT quantidade_op INTO v_qtd FROM prod_op_palete_plano WHERE op = v_op;
    END IF;
    IF coalesce(v_qtd, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    v_prev := ceil(v_qtd / v_por_caixa);
    IF rast_acima_do_previsto(v_prev, v_ultima) AND NOT rast_tem_liberacao('caixa_etiqueta', v_op, v_ultima) THEN
        RAISE EXCEPTION 'A etiqueta vai até a caixa %, e a OP % prevê % caixas (mais de 10%% acima). Precisa da liberação de um supervisor.',
            v_ultima, v_op, v_prev;
    END IF;
    RETURN NEW;
END $$;
