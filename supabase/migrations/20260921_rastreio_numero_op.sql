-- ============================================================================
-- O numero da OP vem do servico, nao do IdWO
-- Date: 2026-09-21
--
-- O PLN19866.xml estava entrando como OP 28747. 28747 e o IdWO, id interno do
-- Metrics. O numero que a fabrica usa e o Code do plnWS, que e o mesmo que da
-- nome ao arquivo: 19866. Sao dois numeros diferentes na mesma OP.
--
-- Guardamos os dois: numero_op e o da fabrica, id_wo fica para conferir com a
-- TI quando um roteiro nao bater. E a descricao do servico ("XL - 201303
-- Cartucho Rotor 1kg - VTQ") entra para o operador reconhecer a OP na lista.
--
-- Antes desta migration, rode scripts/rastreio_apagar_op.sql nas OPs que
-- entraram com o numero errado, senao elas ficam no sistema com IdWO no lugar
-- do numero da OP.
-- ============================================================================

ALTER TABLE rast_ops
    ADD COLUMN IF NOT EXISTS id_wo      INTEGER,
    ADD COLUMN IF NOT EXISTS descricao  TEXT;

COMMENT ON COLUMN rast_ops.numero_op IS 'Numero da OP na fabrica: Code do plnWS, igual ao nome do arquivo PLNxxxxx.xml.';
COMMENT ON COLUMN rast_ops.id_wo     IS 'IdWO, id interno do Metrics. Nao e o numero da OP; serve para conferencia com a TI.';
COMMENT ON COLUMN rast_ops.descricao IS 'Descricao do servico no Metrics: cliente e produto.';

CREATE OR REPLACE FUNCTION rast_importar_op(
    p_op        JSONB,
    p_roteiro   JSONB,
    p_produtos  JSONB,
    p_arquivo   TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_numero  INTEGER := (p_op->>'numero_op')::INTEGER;
    v_versao  TEXT    := coalesce(p_op->>'versao_xml', '');
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

    UPDATE rast_ops SET ativa = false WHERE numero_op = v_numero AND ativa;

    INSERT INTO rast_ops (numero_op, id_wo, descricao, pedido, versao_xml,
                          entrega_prevista, inicio_minimo, status_erp, arquivo_origem)
    VALUES (
        v_numero,
        nullif(p_op->>'id_wo', '')::INTEGER,
        nullif(p_op->>'descricao', ''),
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
        INSERT INTO rast_op_produtos (op_id, codigo, descricao, quantidade, unidade_id)
        VALUES (
            v_op_id,
            v_item->>'codigo',
            v_item->>'descricao',
            nullif(v_item->>'quantidade', '')::NUMERIC,
            nullif(v_item->>'unidade_id', '')::INTEGER
        );
    END LOOP;

    RETURN v_op_id;
END $$;

REVOKE ALL ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT) TO authenticated;
