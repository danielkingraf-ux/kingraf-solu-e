-- Apaga uma OP importada errado, para ela poder ser importada de novo.
--
-- Por padrao recusa apagar OP que ja tem palete: palete e historico de chao de
-- fabrica, e a ficha dele pode estar grampeada num palete de verdade.
--
-- Para apagar mesmo assim (palete de teste, ficha que ninguem usou), troque
-- v_apagar_paletes para true. Isso apaga tambem etiquetas, movimentos e a
-- ligacao com os paletes de origem.
--
-- Se o palete for de verdade e ja estiver rodando, NAO apague: fale comigo que
-- a gente troca o numero da OP sem perder o historico.

DO $$
DECLARE
    v_numero_op       INTEGER := 28747;   -- <<< numero da OP a apagar
    v_apagar_paletes  BOOLEAN := false;   -- <<< true so para palete de teste
    v_paletes         INTEGER;
    v_op_ids          UUID[];
BEGIN
    SELECT array_agg(id) INTO v_op_ids FROM rast_ops WHERE numero_op = v_numero_op;
    IF v_op_ids IS NULL THEN
        RAISE EXCEPTION 'Não existe OP % no sistema.', v_numero_op;
    END IF;

    SELECT count(*) INTO v_paletes FROM rast_paletes WHERE numero_op = v_numero_op;

    IF v_paletes > 0 AND NOT v_apagar_paletes THEN
        RAISE EXCEPTION 'A OP % tem % palete(s). Se forem de teste, troque v_apagar_paletes para true e rode de novo.',
            v_numero_op, v_paletes;
    END IF;

    IF v_paletes > 0 THEN
        DELETE FROM rast_alocacoes
         WHERE origem_id IN (SELECT id FROM rast_paletes WHERE numero_op = v_numero_op)
            OR palete_id IN (SELECT id FROM rast_paletes WHERE numero_op = v_numero_op);
        DELETE FROM rast_etiquetas      WHERE palete_id IN (SELECT id FROM rast_paletes WHERE numero_op = v_numero_op);
        DELETE FROM rast_palete_eventos WHERE palete_id IN (SELECT id FROM rast_paletes WHERE numero_op = v_numero_op);
        DELETE FROM rast_paletes        WHERE numero_op = v_numero_op;
        RAISE NOTICE '% palete(s) de teste apagados.', v_paletes;
    END IF;

    DELETE FROM rast_op_roteiro  WHERE op_id = ANY(v_op_ids);
    DELETE FROM rast_op_produtos WHERE op_id = ANY(v_op_ids);
    DELETE FROM rast_ops         WHERE id = ANY(v_op_ids);

    RAISE NOTICE 'OP % apagada. Pode importar o XML de novo.', v_numero_op;
END $$;

-- Sem id_wo nem descricao aqui de proposito: este script roda ANTES da
-- migration que cria essas colunas.
SELECT numero_op, pedido, versao_xml, arquivo_origem, importado_em
  FROM rast_ops ORDER BY importado_em DESC;
