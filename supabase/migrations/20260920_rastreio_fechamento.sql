-- ============================================================================
-- Fechamento da OP: bate a quantidade setor a setor e mostra quem fez cada palete
-- Date: 2026-09-20
--
-- Responde as perguntas do chao: o que a impressao produziu chegou todo no corte
-- e vinco? O que o corte e vinco produziu chegou na colagem? Quanto virou
-- refugo? O que ainda esta parado em algum canto? E quem assinou cada palete?
--
-- As colunas, por setor:
--   entrada       = soma dos paletes bipados na entrada do setor (unidade de entrada)
--   ja_lancado    = quanto dessa entrada ja virou palete de saida ou refugo
--   falta_lancar  = entrada - ja_lancado (material que entrou e ainda nao foi lancado)
--   saida         = soma dos paletes criados no setor (unidade de saida)
--   refugo        = refugo lancado junto com os paletes do setor
--   em_aberto     = paletes criados aqui que ainda nao foram baixados no destino
--
-- entrada e saida podem estar em unidades diferentes (folha vira unidade no
-- destaque). Por isso "falta_lancar" e calculado na unidade de ENTRADA, pelas
-- alocacoes, que sao exatas. Nao se subtrai saida de entrada direto.
-- ============================================================================

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
        SELECT r.setor_id,
               sum(e.quantidade) AS qtd,
               count(*)::INTEGER AS paletes,
               min(p.unidade) AS unidade,
               coalesce(sum((SELECT sum(a.quantidade) FROM rast_alocacoes a
                              WHERE a.origem_id = p.id AND NOT a.estornado)), 0) AS usado
          FROM rast_palete_eventos e
          JOIN rast_paletes p    ON p.id = e.palete_id
          JOIN rast_op_roteiro r ON r.id = e.etapa_id
         WHERE e.tipo = 'consumido' AND p.numero_op = p_numero_op
         GROUP BY r.setor_id
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
    -- refugo que o fornecedor devolveu a menos entra no setor da portaria
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

REVOKE ALL ON FUNCTION rast_fechamento_op(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_fechamento_op(INTEGER) TO authenticated;

-- Encaixotamento e Paletizacao sao o fim da linha no Metrics: cai na expedicao.
UPDATE rast_setores
   SET palavras_chave = ARRAY['expedi', 'encaixot', 'paletiz']
 WHERE sigla = 'EXP' AND palavras_chave = ARRAY['expedi'];
