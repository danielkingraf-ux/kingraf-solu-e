-- ============================================================================
-- Painel por OP e liberacao da supervisao
-- Date: 2026-09-24
--
-- 1. LIBERACAO. Emitir mais de 10% acima do previsto (etiqueta de palete,
--    etiqueta de caixa, palete novo no rastreio) ou encerrar a OP com
--    qualquer quantidade a menos precisa da matricula de um SUPERVISOR
--    (rast_operadores.papel = 'supervisor'). Toda liberacao fica registrada:
--    quem liberou, o que, previsto x emitido e o motivo.
--
-- 2. ENCERRAMENTO. A OP e encerrada no painel. Encerrar abaixo do previsto
--    exige uma liberacao de encerramento dada nos ultimos 15 minutos.
--
-- 3. PAINEL. Uma funcao so devolve o resumo de todas as OPs, para a tela nao
--    fazer uma consulta por OP.
--
-- A OP e guardada como TEXTO nas tabelas novas: a reimpressao (20148_01) vai
-- precisar disso, e aqui nao custa nada.
--
-- Nao altera nenhuma tabela nem funcao existente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Liberacoes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rast_liberacoes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo           TEXT NOT NULL CHECK (tipo IN (
                       'palete_etiqueta', 'caixa_etiqueta', 'palete_rastreio', 'encerrar_op')),
    op             TEXT NOT NULL,
    previsto       NUMERIC,
    emitido        NUMERIC,
    supervisor_id  UUID NOT NULL REFERENCES rast_operadores(id),
    motivo         TEXT NOT NULL,
    -- O que foi liberado: codigo do palete, faixa de caixas, etc.
    referencia     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS rast_liberacoes_op_idx ON rast_liberacoes (op, created_at DESC);

COMMENT ON TABLE rast_liberacoes IS
    'Emissao fora do previsto liberada por supervisor. So entra por rast_liberar; nada e editado nem apagado.';

CREATE OR REPLACE FUNCTION rast_liberar(
    p_matricula   TEXT,
    p_tipo        TEXT,
    p_op          TEXT,
    p_previsto    NUMERIC,
    p_emitido     NUMERIC,
    p_motivo      TEXT,
    p_referencia  TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sup  rast_operadores;
    v_id   UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login no sistema antes de liberar.';
    END IF;
    v_sup := rast_operador_ativo(p_matricula);
    IF v_sup.papel <> 'supervisor' THEN
        RAISE EXCEPTION 'A matrícula % não é de supervisor. Só a supervisão libera emissão fora do previsto.',
            v_sup.matricula;
    END IF;
    IF coalesce(btrim(p_motivo), '') = '' THEN
        RAISE EXCEPTION 'Escreva o motivo da liberação.';
    END IF;
    IF coalesce(btrim(p_op), '') = '' THEN
        RAISE EXCEPTION 'OP obrigatória na liberação.';
    END IF;

    INSERT INTO rast_liberacoes (tipo, op, previsto, emitido, supervisor_id, motivo, referencia)
    VALUES (p_tipo, upper(btrim(p_op)), p_previsto, p_emitido, v_sup.id, btrim(p_motivo), p_referencia)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Painel: resumo de cada OP
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rast_op_encerramentos (
    op             TEXT PRIMARY KEY,
    encerrada_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    encerrada_por  UUID DEFAULT auth.uid(),
    liberacao_id   UUID REFERENCES rast_liberacoes(id),
    -- Foto dos numeros no momento do encerramento.
    resumo         JSONB
);

COMMENT ON TABLE rast_op_encerramentos IS
    'OP encerrada no painel. Encerrar abaixo do previsto exige liberacao de supervisor.';

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
    -- Da etiqueta de palete (prod_op_palete_plano): como embala.
    qtd_por_caixa       NUMERIC,
    caixas_por_pallet   INTEGER,
    -- Rastreio: paletes por setor de origem, sem os cancelados.
    setores             JSONB,
    paletes_colagem     INTEGER,
    pecas_colagem       NUMERIC,
    paletes_expedicao   INTEGER,
    pecas_expedicao     NUMERIC,
    paletes_em_aberto   INTEGER,
    -- Etiquetas emitidas.
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
               -- A expedicao recebe = o palete finaliza (rast_bipar).
               sum(finalizados)::INTEGER AS finalizados,
               sum(qtd_finalizada) AS qtd_finalizada,
               sum(paletes) FILTER (WHERE sigla = 'COL')::INTEGER AS col_paletes,
               sum(qtd) FILTER (WHERE sigla = 'COL') AS col_qtd
          FROM pal GROUP BY numero_op
    ),
    cx AS (
        SELECT upper(btrim(e.op)) AS op, max(greatest(e.range_start, e.range_end))::INTEGER AS caixas
          FROM prod_etiquetas_caixa e
         WHERE upper(btrim(e.op)) IN (SELECT op FROM o)
         GROUP BY 1
    ),
    ep AS (
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
           coalesce(pal_op.col_paletes, 0), coalesce(pal_op.col_qtd, 0),
           coalesce(pal_op.finalizados, 0), coalesce(pal_op.qtd_finalizada, 0),
           coalesce(pal_op.abertos, 0),
           coalesce(cx.caixas, 0), coalesce(ep.etiquetas, 0), coalesce(lib.n, 0),
           enc.encerrada_em
      FROM o
      LEFT JOIN prod                   ON prod.op_id = o.id
      LEFT JOIN rast_clientes c        ON c.id = o.cliente_id
      LEFT JOIN prod_op_palete_plano pl ON pl.op = o.op
      LEFT JOIN pal_op                 ON pal_op.numero_op = o.numero_op
      LEFT JOIN cx                     ON cx.op = o.op
      LEFT JOIN ep                     ON ep.op = o.op
      LEFT JOIN lib                    ON lib.op = o.op
      LEFT JOIN rast_op_encerramentos enc ON enc.op = o.op
     ORDER BY o.importado_em DESC;
$$;

-- ---------------------------------------------------------------------------
-- 3. Encerrar e reabrir
-- ---------------------------------------------------------------------------

-- Encerrar e so para a conta de administracao (PCP, supervisao). Se a
-- expedicao recebeu menos pecas que a OP pede, ou saiu menos caixa que o
-- previsto, precisa de liberacao de encerramento recente desta OP.
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
    v_falta := (v_linha.qtd_op IS NOT NULL AND v_linha.pecas_expedicao < v_linha.qtd_op)
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

CREATE OR REPLACE FUNCTION rast_reabrir_op(p_op TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT rast_eh_admin() THEN
        RAISE EXCEPTION 'Só a conta de administração reabre OP.';
    END IF;
    DELETE FROM rast_op_encerramentos WHERE op = upper(btrim(p_op));
END $$;

-- ---------------------------------------------------------------------------
-- Acesso: leitura para quem esta logado, escrita so pelas funcoes
-- ---------------------------------------------------------------------------

ALTER TABLE rast_liberacoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rast_op_encerramentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura rast_liberacoes" ON rast_liberacoes;
CREATE POLICY "Leitura rast_liberacoes" ON rast_liberacoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Leitura rast_op_encerramentos" ON rast_op_encerramentos;
CREATE POLICY "Leitura rast_op_encerramentos" ON rast_op_encerramentos FOR SELECT TO authenticated USING (true);

REVOKE ALL ON FUNCTION rast_liberar(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_painel_ops(INTEGER)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_encerrar_op(TEXT, UUID)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_reabrir_op(TEXT)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_liberar(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rast_painel_ops(INTEGER)      TO authenticated;
GRANT EXECUTE ON FUNCTION rast_encerrar_op(TEXT, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION rast_reabrir_op(TEXT)          TO authenticated;
