-- ============================================================================
-- Cliente e modelos da OP
-- Date: 2026-09-21
--
-- Duas coisas que faltavam:
--
-- 1. CLIENTE. O XML traz so o numero (IdActorCustomer), nunca o nome. Fica uma
--    tabela de para-de-para, preenchida na mao como as unidades: 402 = Detoni,
--    316 = Vult, 9430 = VTQ.
--
-- 2. MODELOS. OP de embalagem simples tem um modelo. A do batom Vult tem cinco,
--    cada um com a sua quantidade (25.500 + 49.500 + 13.000 + 21.000 + 9.000 =
--    118.000, o mesmo total da colagem). Ate o corte e vinco a folha tem os
--    cinco modelos juntos, entao o palete NAO tem modelo. Do destaque em diante
--    o material ja esta separado, e cada palete passa a ser de um modelo so.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rast_clientes (
    id     INTEGER PRIMARY KEY,      -- IdActorCustomer do Metrics
    nome   TEXT,
    ativo  BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE rast_clientes IS
    'IdActorCustomer do Metrics. O nome nao vem no XML: preencher na mao.';

ALTER TABLE rast_ops         ADD COLUMN IF NOT EXISTS cliente_id   INTEGER;
ALTER TABLE rast_op_produtos ADD COLUMN IF NOT EXISTS qtd_aprovada NUMERIC;

-- Do destaque em diante o palete e de um modelo so.
ALTER TABLE rast_setores ADD COLUMN IF NOT EXISTS exige_produto BOOLEAN NOT NULL DEFAULT false;
UPDATE rast_setores SET exige_produto = true WHERE sigla IN ('DST', 'COL', 'EXP');

COMMENT ON COLUMN rast_setores.exige_produto IS
    'Setor onde o material ja esta separado por modelo: o palete criado aqui precisa dizer de qual modelo e, quando a OP tem mais de um.';

ALTER TABLE rast_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura rast_clientes" ON rast_clientes;
CREATE POLICY "Leitura rast_clientes" ON rast_clientes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Escrita rast_clientes" ON rast_clientes;
CREATE POLICY "Escrita rast_clientes" ON rast_clientes
    FOR ALL TO authenticated USING (rast_eh_admin()) WITH CHECK (rast_eh_admin());

-- ---------------------------------------------------------------------------
-- Importacao: grava cliente e modelos
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Criar palete: a partir do destaque o palete diz de qual modelo e
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS rast_criar_paletes(UUID, TEXT, TEXT, NUMERIC[], NUMERIC, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION rast_criar_paletes(
    p_etapa_id     UUID,
    p_matricula    TEXT,
    p_maquina      TEXT,
    p_quantidades  NUMERIC[],
    p_refugo       NUMERIC DEFAULT 0,
    p_unidade      TEXT DEFAULT 'folhas',
    p_status       TEXT DEFAULT 'aprovado',
    p_observacao   TEXT DEFAULT NULL,
    p_produto_id   UUID DEFAULT NULL
) RETURNS SETOF rast_paletes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_oper      rast_operadores;
    v_etapa     rast_op_roteiro;
    v_op        rast_ops;
    v_setor     rast_setores;
    v_destino   UUID;
    v_qtd       NUMERIC;
    v_numero    INTEGER;
    v_palete    rast_paletes;
    v_tem_antes BOOLEAN;
    v_saldo     NUMERIC;
    v_novo      NUMERIC;
    v_poses     NUMERIC;
    v_modelos   INTEGER;
    v_agora     TIMESTAMPTZ := now();
    v_primeiro  BOOLEAN := true;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login no sistema antes de registrar palete.';
    END IF;

    v_oper := rast_operador_ativo(p_matricula);

    SELECT * INTO v_etapa FROM rast_op_roteiro WHERE id = p_etapa_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Etapa não encontrada. Busque a OP de novo.';
    END IF;
    IF NOT v_etapa.movimenta_palete THEN
        RAISE EXCEPTION 'A etapa "%" não movimenta palete. Escolha a etapa onde o material foi produzido.', v_etapa.processo;
    END IF;

    SELECT * INTO v_op FROM rast_ops WHERE id = v_etapa.op_id;
    IF NOT v_op.ativa THEN
        RAISE EXCEPTION 'A OP % tem versão mais nova importada. Busque a OP de novo para usar o roteiro atual.', v_op.numero_op;
    END IF;

    SELECT * INTO v_setor FROM rast_setores WHERE id = v_etapa.setor_id;
    IF v_setor.id IS NULL THEN
        RAISE EXCEPTION 'A etapa "%" está sem setor. Peça ao PCP para reimportar a OP.', v_etapa.processo;
    END IF;
    IF v_etapa.terceiros THEN
        RAISE EXCEPTION 'Palete de terceiros volta com a mesma ficha. Use "Retorno de terceiros" na tela de bipagem.';
    END IF;

    -- Modelo: obrigatorio do destaque em diante quando a OP tem mais de um.
    SELECT count(*) INTO v_modelos FROM rast_op_produtos WHERE op_id = v_op.id;

    IF p_produto_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM rast_op_produtos WHERE id = p_produto_id AND op_id = v_op.id
    ) THEN
        RAISE EXCEPTION 'O modelo escolhido não é desta OP. Busque a OP de novo.';
    END IF;

    IF p_produto_id IS NULL AND v_setor.exige_produto AND v_modelos > 1 THEN
        RAISE EXCEPTION 'A OP % tem % modelos e, no setor %, cada palete é de um modelo só. Escolha o modelo antes de registrar.',
            v_op.numero_op, v_modelos, v_setor.nome;
    END IF;

    -- OP de um modelo so: o palete ja nasce amarrado, sem ninguem escolher.
    IF p_produto_id IS NULL AND v_modelos = 1 AND v_setor.exige_produto THEN
        SELECT id INTO p_produto_id FROM rast_op_produtos WHERE op_id = v_op.id;
    END IF;

    IF p_quantidades IS NULL OR array_length(p_quantidades, 1) IS NULL THEN
        RAISE EXCEPTION 'Informe a quantidade de pelo menos um palete.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_quantidades) q WHERE q IS NULL OR q <= 0) THEN
        RAISE EXCEPTION 'Toda quantidade de palete tem que ser maior que zero.';
    END IF;
    IF coalesce(p_refugo, 0) < 0 THEN
        RAISE EXCEPTION 'Refugo não pode ser negativo.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('rast_pal_' || v_op.numero_op || '_' || v_setor.id));

    SELECT EXISTS (
        SELECT 1 FROM rast_op_roteiro
         WHERE op_id = v_etapa.op_id AND seq < v_etapa.seq AND movimenta_palete
    ) INTO v_tem_antes;

    v_poses := coalesce(nullif(v_etapa.poses_por_ciclo, 0), 1);

    IF v_tem_antes THEN
        v_saldo := rast_saldo_entrada(v_op.numero_op, v_setor.id, p_unidade, v_poses);
        SELECT sum(q) + coalesce(p_refugo, 0) INTO v_novo FROM unnest(p_quantidades) q;

        IF v_novo > v_saldo THEN
            RAISE EXCEPTION 'Quantidade acima do que entrou. O setor % tem % % disponíveis dos paletes bipados na entrada desta OP, e este lançamento soma % (com refugo). Bipe os paletes de entrada que faltam ou corrija a quantidade.',
                v_setor.nome, v_saldo, p_unidade, v_novo;
        END IF;
    END IF;

    v_destino := rast_proxima_etapa(v_etapa.id);

    SELECT coalesce(max(numero), 0) INTO v_numero
      FROM rast_paletes
     WHERE numero_op = v_op.numero_op AND setor_origem_id = v_setor.id;

    FOREACH v_qtd IN ARRAY p_quantidades LOOP
        v_numero := v_numero + 1;

        INSERT INTO rast_paletes (
            codigo, op_id, numero_op, produto_id, setor_origem_id, numero,
            etapa_origem_id, etapa_destino_id, maquina, operador_id,
            quantidade, unidade, status, produzido_em, cura_horas, liberado_em, observacao
        ) VALUES (
            v_op.numero_op || '-' || v_setor.sigla || '-' || lpad(v_numero::TEXT, 3, '0'),
            v_op.id, v_op.numero_op, p_produto_id, v_setor.id, v_numero,
            v_etapa.id, v_destino, nullif(trim(p_maquina), ''), v_oper.id,
            v_qtd, p_unidade, p_status, v_agora, v_setor.cura_horas,
            v_agora + make_interval(secs => v_setor.cura_horas * 3600),
            nullif(trim(p_observacao), '')
        )
        RETURNING * INTO v_palete;

        IF v_tem_antes THEN
            PERFORM rast_alocar(v_palete.id, v_op.numero_op, v_setor.id, v_qtd, p_unidade, v_poses);
        END IF;

        INSERT INTO rast_palete_eventos (palete_id, tipo, etapa_id, operador_id, quantidade, refugo)
        VALUES (v_palete.id, 'criado', v_etapa.id, v_oper.id, v_qtd,
                CASE WHEN v_primeiro THEN coalesce(p_refugo, 0) ELSE 0 END);
        v_primeiro := false;

        INSERT INTO rast_etiquetas (palete_id, motivo, impressa_por)
        VALUES (v_palete.id, 'original', v_oper.id);

        RETURN NEXT v_palete;
    END LOOP;

    IF v_tem_antes AND coalesce(p_refugo, 0) > 0 THEN
        PERFORM rast_alocar(NULL, v_op.numero_op, v_setor.id, p_refugo, p_unidade, v_poses);
    END IF;
END $$;

REVOKE ALL ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION rast_criar_paletes(UUID, TEXT, TEXT, NUMERIC[], NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_criar_paletes(UUID, TEXT, TEXT, NUMERIC[], NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;
