-- ============================================================================
-- Controles do piloto no banco + acertos do painel e do fechamento
-- Date: 2026-09-25
--
-- 1. TRAVAS NO BANCO. A regra dos 10% (20260924_painel_liberacao.sql) estava
--    so na tela. Agora o banco recusa a gravacao sem liberacao de supervisor:
--      - etiqueta de palete com numero acima dos paletes previstos + 10%;
--      - etiqueta de caixa com a ultima caixa acima das previstas + 10%;
--      - palete novo no rastreio com o setor passando o planejado + 10%.
--    Sao gatilhos (BEFORE INSERT/UPDATE): nenhuma funcao existente muda. A
--    liberacao e a que a tela ja pede antes de gravar; o gatilho so confere
--    que ela existe, e da mesma OP, cobre a quantidade e foi dada ha pouco.
--
-- 2. PAINEL.
--      - OP da etiqueta de caixa digitada como "20418/2026" passa a contar na
--        OP 20418 (mesma regra de normalizarOP da tela).
--      - Encerrar so compara caixas quando a OP tem etiqueta de caixa.
--      - Novo: paletes enviados que a expedicao ainda nao bipou, e desde
--        quando o mais antigo deles espera.
--
-- 3. FECHAMENTO DA OP. A expedicao recebe o palete finalizando ele, sem
--    evento 'consumido': a entrada da Expedicao aparecia sempre zerada.
-- ============================================================================

-- OP como a tela normaliza: sem espacos, maiuscula, sem o "/2026" do fim.
CREATE OR REPLACE FUNCTION prod_normaliza_op(p_op TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT upper(btrim(regexp_replace(btrim(coalesce(p_op, '')), '\s*/\s*(19|20)\d{2}\s*$', '')));
$$;

-- Tolerancia combinada com o Daniel: 10% acima do previsto passa direto.
CREATE OR REPLACE FUNCTION rast_acima_do_previsto(p_previsto NUMERIC, p_emitido NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
    SELECT p_previsto IS NOT NULL AND p_previsto > 0 AND p_emitido > p_previsto * 1.10;
$$;

-- Liberacao que cobre esta emissao: mesma OP e tipo, emitido >= o que se
-- quer gravar, dada nos ultimos 30 minutos.
CREATE OR REPLACE FUNCTION rast_tem_liberacao(p_tipo TEXT, p_op TEXT, p_emitido NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM rast_liberacoes l
         WHERE l.tipo = p_tipo AND l.op = p_op AND l.emitido >= p_emitido
           AND l.created_at > now() - interval '30 minutes'
    );
$$;

-- ---------------------------------------------------------------------------
-- 1a. Etiqueta de palete
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prod_trava_etiqueta_palete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_op      TEXT := upper(btrim(coalesce(NEW.op, '')));
    v_numero  INTEGER;
    v_plano   prod_op_palete_plano;
    v_prev    NUMERIC;
BEGIN
    IF NEW.tipo <> 'pallet' OR NEW.info_extra IS NULL OR NOT (NEW.info_extra ? 'paleteNumero') THEN
        RETURN NEW;
    END IF;
    -- Reimpressao ou correcao da mesma etiqueta: o numero nao mudou.
    IF TG_OP = 'UPDATE' AND OLD.info_extra->>'paleteNumero' IS NOT DISTINCT FROM NEW.info_extra->>'paleteNumero' THEN
        RETURN NEW;
    END IF;

    v_numero := nullif(regexp_replace(NEW.info_extra->>'paleteNumero', '\D', '', 'g'), '')::INTEGER;
    SELECT * INTO v_plano FROM prod_op_palete_plano WHERE op = v_op;
    IF v_numero IS NULL OR NOT FOUND OR v_plano.quantidade_op IS NULL
       OR coalesce(v_plano.quantidade_por_caixa, 0) <= 0 OR coalesce(v_plano.caixas_por_pallet, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- Mesma conta da tela: caixas (a incompleta conta) / caixas por palete.
    v_prev := ceil(ceil(v_plano.quantidade_op / v_plano.quantidade_por_caixa) / v_plano.caixas_por_pallet);
    IF rast_acima_do_previsto(v_prev, v_numero) AND NOT rast_tem_liberacao('palete_etiqueta', v_op, v_numero) THEN
        RAISE EXCEPTION 'Palete % da OP % passa de 10%% acima dos % previstos. Precisa da liberação de um supervisor.',
            v_numero, v_op, v_prev;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prod_trava_etiqueta_palete ON prod_etiquetas_historico;
CREATE TRIGGER trg_prod_trava_etiqueta_palete
    BEFORE INSERT OR UPDATE ON prod_etiquetas_historico
    FOR EACH ROW EXECUTE FUNCTION prod_trava_etiqueta_palete();

-- ---------------------------------------------------------------------------
-- 1b. Etiqueta de caixa
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
    IF v_op ~ '^\d+$' THEN
        SELECT id INTO v_op_id FROM rast_ops WHERE numero_op = v_op::INTEGER AND ativa;
    END IF;
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

DROP TRIGGER IF EXISTS trg_prod_trava_etiqueta_caixa ON prod_etiquetas_caixa;
CREATE TRIGGER trg_prod_trava_etiqueta_caixa
    BEFORE INSERT OR UPDATE ON prod_etiquetas_caixa
    FOR EACH ROW EXECUTE FUNCTION prod_trava_etiqueta_caixa();

-- ---------------------------------------------------------------------------
-- 1c. Palete novo no rastreio
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_trava_palete_novo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_planejado  NUMERIC;
    v_acumulado  NUMERIC;
BEGIN
    SELECT r.qtd_planejada INTO v_planejado
      FROM rast_op_roteiro r
     WHERE r.op_id = NEW.op_id AND r.setor_id = NEW.setor_origem_id AND r.movimenta_palete
     ORDER BY r.seq LIMIT 1;
    IF coalesce(v_planejado, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- O que o setor ja soltou desta OP (paletes do mesmo lancamento que ja
    -- entraram contam aqui) mais este palete.
    SELECT coalesce(sum(p.quantidade), 0) + NEW.quantidade INTO v_acumulado
      FROM rast_paletes p
     WHERE p.numero_op = NEW.numero_op AND p.setor_origem_id = NEW.setor_origem_id
       AND p.situacao <> 'cancelado';

    IF rast_acima_do_previsto(v_planejado, v_acumulado)
       AND NOT rast_tem_liberacao('palete_rastreio', NEW.numero_op::TEXT, v_acumulado) THEN
        RAISE EXCEPTION 'Este lançamento leva o setor a % na OP %, e o planejado é % (mais de 10%% acima). Precisa da liberação de um supervisor.',
            v_acumulado, NEW.numero_op, v_planejado;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rast_trava_palete_novo ON rast_paletes;
CREATE TRIGGER trg_rast_trava_palete_novo
    BEFORE INSERT ON rast_paletes
    FOR EACH ROW EXECUTE FUNCTION rast_trava_palete_novo();

-- ---------------------------------------------------------------------------
-- 2. Painel (muda o retorno: precisa DROP)
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
    aguardando_desde    TIMESTAMPTZ
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
             WHERE l.op = o.op AND l.ordem = coalesce(pal_op.finalizados, 0) + 1)
      FROM o
      LEFT JOIN prod                    ON prod.op_id = o.id
      LEFT JOIN rast_clientes c         ON c.id = o.cliente_id
      LEFT JOIN prod_op_palete_plano pl ON pl.op = o.op
      LEFT JOIN pal_op                  ON pal_op.numero_op = o.numero_op
      LEFT JOIN cx                      ON cx.op = o.op
      LEFT JOIN ep                      ON ep.op = o.op
      LEFT JOIN ep_todas                ON ep_todas.op = o.op
      LEFT JOIN lib                     ON lib.op = o.op
      LEFT JOIN rast_op_encerramentos enc ON enc.op = o.op
     ORDER BY o.importado_em DESC;
$$;

REVOKE ALL ON FUNCTION rast_painel_ops(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_painel_ops(INTEGER) TO authenticated;

-- Encerrar: caixas so contam se a OP tem etiqueta de caixa.
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
                AND v_linha.caixas_emitidas < v_prev_caixas);

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

-- ---------------------------------------------------------------------------
-- 3. Fechamento da OP: a expedicao entra pelo evento 'finalizado'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_fechamento_op(p_numero_op INTEGER)
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

REVOKE ALL ON FUNCTION rast_tem_liberacao(TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_tem_liberacao(TEXT, TEXT, NUMERIC) TO authenticated;
