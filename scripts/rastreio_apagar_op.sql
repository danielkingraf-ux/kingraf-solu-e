-- Apaga uma OP importada errado, para ela poder ser importada de novo.
--
-- So funciona se a OP ainda NAO tiver palete: palete e historico de chao de
-- fabrica e nao se apaga. Se ja tiver palete, chame o supervisor e decidam
-- caso a caso.
--
-- Troque o numero na primeira linha e rode.

DO $$
DECLARE
    v_numero_op INTEGER := 28747;   -- <<< numero da OP a apagar
    v_paletes   INTEGER;
BEGIN
    SELECT count(*) INTO v_paletes FROM rast_paletes WHERE numero_op = v_numero_op;

    IF v_paletes > 0 THEN
        RAISE EXCEPTION 'A OP % tem % palete(s) e nao pode ser apagada.', v_numero_op, v_paletes;
    END IF;

    DELETE FROM rast_op_roteiro  WHERE op_id IN (SELECT id FROM rast_ops WHERE numero_op = v_numero_op);
    DELETE FROM rast_op_produtos WHERE op_id IN (SELECT id FROM rast_ops WHERE numero_op = v_numero_op);
    DELETE FROM rast_ops         WHERE numero_op = v_numero_op;

    RAISE NOTICE 'OP % apagada. Pode importar o XML de novo.', v_numero_op;
END $$;

SELECT numero_op, id_wo, pedido, versao_xml, arquivo_origem, importado_em
  FROM rast_ops ORDER BY importado_em DESC;
