-- ============================================================================
-- Modulo 4: Rastreio de Palete
-- Date: 2026-09-19
--
-- Tabelas novas, todas com prefixo rast_. Nenhuma tabela dos modulos de
-- Producao, Qualidade ou Etiquetas e alterada.
--
-- Fluxo:
--   * O roteiro da OP vem do XML do Metrics (importado pela tela, o parser
--     roda no navegador e so manda o roteiro filtrado).
--   * O palete nasce num setor (normalmente a impressao) com identidade
--     OP + setor de origem + sequencial. Ex.: 20418-IMP-003.
--   * O destino e a proxima etapa do roteiro que movimenta palete.
--   * Setor interno CONSOME o palete ao bipar e cria os proprios paletes.
--     A impressao faz mais paletes que o corte e vinco, entao nao e 1 para 1.
--   * Terceiros: o mesmo palete sai pela portaria e volta com a mesma ficha.
--
-- Regras que nao podem ser quebradas (validadas aqui no banco, nao na tela):
--   1. Trava de cura: palete da impressao so libera 12h depois de produzido.
--   2. Trava de destino: so o setor de destino consegue bipar.
--   3. Conferencia: saida + refugo nao passa do que o setor consumiu.
--   4. Etiqueta nunca cria palete: reimpressao so gera linha em rast_etiquetas.
--
-- Seguranca: leitura para authenticated. Escrita nas tabelas de palete e de OP
-- so pelas funcoes abaixo (SECURITY DEFINER), para as travas valerem sempre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cadastros de apoio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rast_setores (
    id              SERIAL PRIMARY KEY,
    nome            TEXT NOT NULL UNIQUE,
    sigla           TEXT NOT NULL UNIQUE,          -- vai no codigo do palete
    palavras_chave  TEXT[] NOT NULL DEFAULT '{}',  -- casa com o nome do processo no Metrics
    terceiros       BOOLEAN NOT NULL DEFAULT false,-- estacao da portaria (saida e retorno)
    cura_horas      NUMERIC NOT NULL DEFAULT 0,    -- cura aplicada ao palete que nasce aqui
    expedicao       BOOLEAN NOT NULL DEFAULT false,-- fim da linha: bipar aqui finaliza o palete
    ativo           BOOLEAN NOT NULL DEFAULT true,
    ordem           INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE rast_setores IS
    'Setores do chao de fabrica. O processo do Metrics e ligado ao setor pelas palavras-chave, e o PCP confirma na importacao.';

INSERT INTO rast_setores (nome, sigla, palavras_chave, terceiros, expedicao, cura_horas, ordem) VALUES
    ('Impressão',          'IMP', ARRAY['impress'],                                false, false, 12, 10),
    ('Metalização',        'MET', ARRAY['metaliz'],                                false, false, 0,  20),
    ('Hot stamping',       'HOT', ARRAY['hot stamp', 'hotstamp'],                  false, false, 0,  30),
    ('Verniz',             'VRN', ARRAY['verniz'],                                 false, false, 0,  40),
    ('Relevo',             'REL', ARRAY['relevo'],                                 false, false, 0,  50),
    ('Corte e vinco',      'CV',  ARRAY['corte e vinco', 'corte/vinco', 'vinco'],  false, false, 0,  60),
    ('Destaque',           'DST', ARRAY['destaque'],                               false, false, 0,  70),
    ('Colagem',            'COL', ARRAY['colagem', 'coladeira'],                   false, false, 0,  80),
    ('Terceiros (portaria)','TER', ARRAY[]::TEXT[],                                true,  false, 0,  90),
    -- Encaixotamento e Paletizacao sao o fim da linha no Metrics: cai na expedicao.
    ('Expedição',          'EXP', ARRAY['expedi', 'encaixot', 'paletiz'],          false, true,  0, 100)
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS rast_operadores (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matricula   TEXT NOT NULL UNIQUE,
    nome        TEXT NOT NULL,
    setor_id    INTEGER REFERENCES rast_setores(id),
    ativo       BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rast_unidades (
    id              INTEGER PRIMARY KEY,   -- e o IdUnit do XML
    descricao       TEXT,
    fator_conversao NUMERIC
);

COMMENT ON TABLE rast_unidades IS
    'IdUnit do Metrics. O nome nao vem no XML: preencher na mao (77, 81, 82, 83, 85 vistos ate agora).';

INSERT INTO rast_unidades (id) VALUES (77), (81), (82), (83), (85)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Bloco OP (vem do XML, o sistema so le)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rast_ops (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_op         INTEGER NOT NULL,
    pedido            TEXT,
    versao_xml        TEXT NOT NULL DEFAULT '',
    entrega_prevista  DATE,
    inicio_minimo     TEXT,
    status_erp        TEXT,
    arquivo_origem    TEXT,
    ativa             BOOLEAN NOT NULL DEFAULT true, -- versao usada para paletes novos
    importado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    importado_por     UUID DEFAULT auth.uid(),
    UNIQUE (numero_op, versao_xml)
);

COMMENT ON TABLE rast_ops IS
    'Reimportar com versao nova cria linha nova. Paletes ja criados continuam apontando para a versao antiga.';

CREATE INDEX IF NOT EXISTS rast_ops_numero_idx ON rast_ops (numero_op) WHERE ativa;

CREATE TABLE IF NOT EXISTS rast_op_produtos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    op_id       UUID NOT NULL REFERENCES rast_ops(id) ON DELETE CASCADE,
    codigo      TEXT,
    descricao   TEXT,
    quantidade  NUMERIC,
    unidade_id  INTEGER
);

CREATE TABLE IF NOT EXISTS rast_op_roteiro (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    op_id             UUID NOT NULL REFERENCES rast_ops(id) ON DELETE CASCADE,
    seq               INTEGER NOT NULL,
    processo          TEXT NOT NULL,
    setor_id          INTEGER REFERENCES rast_setores(id),
    movimenta_palete  BOOLEAN NOT NULL DEFAULT true,
    terceiros         BOOLEAN NOT NULL DEFAULT false,
    alerta_terceiros  BOOLEAN NOT NULL DEFAULT false,
    qtd_planejada     NUMERIC,
    refugo_acerto     NUMERIC,
    refugo_rodagem    NUMERIC,
    velocidade        NUMERIC,
    tempo_acerto_min  NUMERIC,
    poses_por_ciclo   NUMERIC,
    UNIQUE (op_id, seq)
);

COMMENT ON COLUMN rast_op_roteiro.movimenta_palete IS
    'false = esta no roteiro mas nao recebe palete (ex.: controle de qualidade). Se ficar true por engano, a OP trava esperando uma baixa que nunca acontece.';
COMMENT ON COLUMN rast_op_roteiro.alerta_terceiros IS
    'Nome bateu na lista de servicos externos mas o Metrics nao escreveu (Terceiros). Tratado como externo (lado seguro); PCP confere o cadastro.';

-- ---------------------------------------------------------------------------
-- 3. Bloco palete
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rast_paletes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo            TEXT NOT NULL UNIQUE,         -- 20418-IMP-003, vai no QR e no codigo de barras
    op_id             UUID NOT NULL REFERENCES rast_ops(id),
    numero_op         INTEGER NOT NULL,
    produto_id        UUID REFERENCES rast_op_produtos(id), -- nulo ate o destaque
    setor_origem_id   INTEGER NOT NULL REFERENCES rast_setores(id),
    numero            INTEGER NOT NULL,             -- sequencial por OP + setor de origem
    etapa_origem_id   UUID NOT NULL REFERENCES rast_op_roteiro(id),
    etapa_destino_id  UUID REFERENCES rast_op_roteiro(id), -- nulo = fim do roteiro
    maquina           TEXT,
    operador_id       UUID NOT NULL REFERENCES rast_operadores(id),
    quantidade        NUMERIC NOT NULL CHECK (quantidade > 0),
    unidade           TEXT NOT NULL DEFAULT 'folhas' CHECK (unidade IN ('folhas', 'unidades')),
    status            TEXT NOT NULL DEFAULT 'aprovado'
                      CHECK (status IN ('aprovado', 'escolha', 'rejeitado', 'sobra')),
    situacao          TEXT NOT NULL DEFAULT 'aguardando'
                      CHECK (situacao IN ('aguardando', 'em_terceiros', 'consumido', 'finalizado', 'cancelado')),
    produzido_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    cura_horas        NUMERIC NOT NULL DEFAULT 0,
    liberado_em       TIMESTAMPTZ NOT NULL,
    observacao        TEXT,
    created_by        UUID DEFAULT auth.uid(),
    UNIQUE (numero_op, setor_origem_id, numero)
);

CREATE INDEX IF NOT EXISTS rast_paletes_op_idx       ON rast_paletes (op_id);
CREATE INDEX IF NOT EXISTS rast_paletes_situacao_idx ON rast_paletes (situacao) WHERE situacao IN ('aguardando', 'em_terceiros');

CREATE TABLE IF NOT EXISTS rast_palete_eventos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    palete_id    UUID NOT NULL REFERENCES rast_paletes(id),
    tipo         TEXT NOT NULL CHECK (tipo IN (
                     'criado', 'consumido', 'saida_terceiros', 'retorno_terceiros',
                     'finalizado', 'cancelado', 'ajuste')),
    etapa_id     UUID REFERENCES rast_op_roteiro(id),
    operador_id  UUID REFERENCES rast_operadores(id),
    quantidade   NUMERIC,
    refugo       NUMERIC NOT NULL DEFAULT 0,
    ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    observacao   TEXT,
    created_by   UUID DEFAULT auth.uid()
);

COMMENT ON TABLE rast_palete_eventos IS 'Historico. Nada e apagado, nada e editado.';

CREATE INDEX IF NOT EXISTS rast_eventos_palete_idx ON rast_palete_eventos (palete_id);
CREATE INDEX IF NOT EXISTS rast_eventos_etapa_idx  ON rast_palete_eventos (etapa_id, tipo);

CREATE TABLE IF NOT EXISTS rast_etiquetas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero        BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE, -- "Id Etiqueta", diferente do palete
    palete_id     UUID NOT NULL REFERENCES rast_paletes(id),
    motivo        TEXT NOT NULL CHECK (motivo IN ('original', 'reimpressao')),
    impressa_por  UUID REFERENCES rast_operadores(id),
    impressa_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS rast_etiquetas_palete_idx ON rast_etiquetas (palete_id);

-- Rastro do material: de quais paletes de entrada saiu cada palete novo.
-- O setor bipa os paletes que chegam (consumo) e, ao criar os paletes de saida,
-- o material e tirado dos paletes bipados na ordem em que entraram (o primeiro
-- que entrou e o primeiro que vai para a maquina). Palete de 1.900 do corte e
-- vinco pode ter vindo de IMP-001 (1.900) ou de IMP-001 (880) + IMP-002 (1.020).
-- A quantidade fica na unidade do palete de ORIGEM (folhas, na maioria).
-- palete_id nulo = refugo do setor tirado daquele palete.
CREATE TABLE IF NOT EXISTS rast_alocacoes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem_id   UUID NOT NULL REFERENCES rast_paletes(id),
    palete_id   UUID REFERENCES rast_paletes(id),
    quantidade  NUMERIC NOT NULL CHECK (quantidade > 0),
    estornado   BOOLEAN NOT NULL DEFAULT false,  -- palete de saida cancelado devolve o saldo
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rast_alocacoes_origem_idx ON rast_alocacoes (origem_id) WHERE NOT estornado;
CREATE INDEX IF NOT EXISTS rast_alocacoes_palete_idx ON rast_alocacoes (palete_id) WHERE NOT estornado;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'rast_setores', 'rast_operadores', 'rast_unidades',
        'rast_ops', 'rast_op_produtos', 'rast_op_roteiro',
        'rast_paletes', 'rast_palete_eventos', 'rast_etiquetas', 'rast_alocacoes'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Leitura %s" ON %I', t, t);
        EXECUTE format('CREATE POLICY "Leitura %s" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    END LOOP;

    -- Cadastros sao editados direto pela tela.
    FOREACH t IN ARRAY ARRAY['rast_setores', 'rast_operadores', 'rast_unidades'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Escrita %s" ON %I', t, t);
        EXECUTE format(
            'CREATE POLICY "Escrita %s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
            t, t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Funcoes auxiliares
-- ---------------------------------------------------------------------------

-- Hora no fuso da fabrica, para as mensagens ao operador.
CREATE OR REPLACE FUNCTION rast_hora_local(t TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT to_char(t AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI "de" DD/MM');
$$;

CREATE OR REPLACE FUNCTION rast_operador_ativo(p_matricula TEXT)
RETURNS rast_operadores
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v rast_operadores;
BEGIN
    SELECT * INTO v FROM rast_operadores WHERE matricula = trim(p_matricula);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Matrícula % não cadastrada. Confira o crachá ou peça ao supervisor para cadastrar.', p_matricula;
    END IF;
    IF NOT v.ativo THEN
        RAISE EXCEPTION 'Matrícula % está inativa. Procure o supervisor.', p_matricula;
    END IF;
    RETURN v;
END $$;

-- Proxima etapa depois de p_etapa que movimenta palete. Nulo = fim do roteiro.
CREATE OR REPLACE FUNCTION rast_proxima_etapa(p_etapa UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r2.id
      FROM rast_op_roteiro r1
      JOIN rast_op_roteiro r2 ON r2.op_id = r1.op_id AND r2.seq > r1.seq AND r2.movimenta_palete
     WHERE r1.id = p_etapa
     ORDER BY r2.seq
     LIMIT 1;
$$;

-- Descricao do destino para mensagem: "Corte e vinco" ou "Terceiros: Laminação".
CREATE OR REPLACE FUNCTION rast_nome_destino(p_etapa UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE
             WHEN p_etapa IS NULL THEN 'Expedição'
             WHEN r.terceiros THEN 'TERCEIROS: ' || regexp_replace(r.processo, '\s*\(terceiros\)', '', 'i')
             ELSE coalesce(s.nome, r.processo)
           END
      FROM (SELECT p_etapa AS id) x
      LEFT JOIN rast_op_roteiro r ON r.id = x.id
      LEFT JOIN rast_setores s ON s.id = r.setor_id;
$$;

-- Paletes bipados na entrada de um setor, nesta OP, com o que ainda sobra de
-- cada um (na unidade do palete de origem), na ordem em que entraram.
-- fator = quanto 1 unidade de origem vale na unidade de saida (folha vira
-- unidade pelas poses; no resto e 1).
CREATE OR REPLACE FUNCTION rast_fila_entrada(
    p_numero_op  INTEGER,
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
    p_numero_op  INTEGER,
    p_setor_id   INTEGER,
    p_unidade    TEXT,
    p_poses      NUMERIC
) RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(sum(greatest(disponivel, 0) * fator), 0)
      FROM rast_fila_entrada(p_numero_op, p_setor_id, p_unidade, p_poses);
$$;

-- Tira p_qtd (na unidade de saida) dos paletes de entrada, primeiro que entrou
-- primeiro que sai. p_palete_id nulo = refugo.
CREATE OR REPLACE FUNCTION rast_alocar(
    p_palete_id  UUID,
    p_numero_op  INTEGER,
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

-- ---------------------------------------------------------------------------
-- 6. Importacao da OP
-- ---------------------------------------------------------------------------
-- p_op:      {numero_op, pedido, versao_xml, entrega_prevista, inicio_minimo, status_erp}
-- p_roteiro: [{seq, processo, setor_id, movimenta_palete, terceiros, alerta_terceiros,
--              qtd_planejada, refugo_acerto, refugo_rodagem, velocidade,
--              tempo_acerto_min, poses_por_ciclo}]
-- p_produtos: [{codigo, descricao, quantidade, unidade_id}]

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
    IF v_numero IS NULL THEN
        RAISE EXCEPTION 'O XML não tem o número da OP (IdWO). Confira se o arquivo é o planejamento exportado do Metrics.';
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

    INSERT INTO rast_ops (numero_op, pedido, versao_xml, entrega_prevista, inicio_minimo, status_erp, arquivo_origem)
    VALUES (
        v_numero,
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

-- ---------------------------------------------------------------------------
-- 7. Criar paletes (regra 3: conferencia de quantidade)
-- ---------------------------------------------------------------------------
-- Um palete por item de p_quantidades. p_refugo e o refugo do setor lancado
-- junto com esse lote de paletes.

CREATE OR REPLACE FUNCTION rast_criar_paletes(
    p_etapa_id     UUID,
    p_matricula    TEXT,
    p_maquina      TEXT,
    p_quantidades  NUMERIC[],
    p_refugo       NUMERIC DEFAULT 0,
    p_unidade      TEXT DEFAULT 'folhas',
    p_status       TEXT DEFAULT 'aprovado',
    p_observacao   TEXT DEFAULT NULL
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

    IF p_quantidades IS NULL OR array_length(p_quantidades, 1) IS NULL THEN
        RAISE EXCEPTION 'Informe a quantidade de pelo menos um palete.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_quantidades) q WHERE q IS NULL OR q <= 0) THEN
        RAISE EXCEPTION 'Toda quantidade de palete tem que ser maior que zero.';
    END IF;
    IF coalesce(p_refugo, 0) < 0 THEN
        RAISE EXCEPTION 'Refugo não pode ser negativo.';
    END IF;

    -- Trava por OP + setor: numero sequencial sem repetir e conferencia consistente.
    PERFORM pg_advisory_xact_lock(hashtext('rast_pal_' || v_op.numero_op || '_' || v_setor.id));

    -- Regra 3. So vale se existe etapa de palete antes desta (a primeira,
    -- normalmente a impressao, nao tem entrada de palete para conferir).
    SELECT EXISTS (
        SELECT 1 FROM rast_op_roteiro
         WHERE op_id = v_etapa.op_id AND seq < v_etapa.seq AND movimenta_palete
    ) INTO v_tem_antes;

    v_poses := coalesce(nullif(v_etapa.poses_por_ciclo, 0), 1);

    IF v_tem_antes THEN
        -- Saldo = o que ainda nao virou palete nem refugo dos paletes bipados
        -- na entrada deste setor, nesta OP, ja na unidade de saida.
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
            codigo, op_id, numero_op, setor_origem_id, numero,
            etapa_origem_id, etapa_destino_id, maquina, operador_id,
            quantidade, unidade, status, produzido_em, cura_horas, liberado_em, observacao
        ) VALUES (
            v_op.numero_op || '-' || v_setor.sigla || '-' || lpad(v_numero::TEXT, 3, '0'),
            v_op.id, v_op.numero_op, v_setor.id, v_numero,
            v_etapa.id, v_destino, nullif(trim(p_maquina), ''), v_oper.id,
            v_qtd, p_unidade, p_status, v_agora, v_setor.cura_horas,
            v_agora + make_interval(secs => v_setor.cura_horas * 3600),
            nullif(trim(p_observacao), '')
        )
        RETURNING * INTO v_palete;

        IF v_tem_antes THEN
            PERFORM rast_alocar(v_palete.id, v_op.numero_op, v_setor.id, v_qtd, p_unidade, v_poses);
        END IF;

        -- O refugo entra uma vez so, no primeiro palete do lancamento.
        INSERT INTO rast_palete_eventos (palete_id, tipo, etapa_id, operador_id, quantidade, refugo)
        VALUES (v_palete.id, 'criado', v_etapa.id, v_oper.id, v_qtd,
                CASE WHEN v_primeiro THEN coalesce(p_refugo, 0) ELSE 0 END);
        v_primeiro := false;

        INSERT INTO rast_etiquetas (palete_id, motivo, impressa_por)
        VALUES (v_palete.id, 'original', v_oper.id);

        RETURN NEXT v_palete;
    END LOOP;

    -- Refugo sai dos paletes de entrada depois das saidas deste lancamento.
    IF v_tem_antes AND coalesce(p_refugo, 0) > 0 THEN
        PERFORM rast_alocar(NULL, v_op.numero_op, v_setor.id, p_refugo, p_unidade, v_poses);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Bipagem (regras 1 e 2)
-- ---------------------------------------------------------------------------
-- A estacao do coletor fica num setor. O palete e aceito se o destino dele
-- e deste setor. Setor interno consome o palete; a portaria (setor de
-- terceiros) registra a saida para o fornecedor.

CREATE OR REPLACE FUNCTION rast_bipar_palete(
    p_codigo     TEXT,
    p_setor_id   INTEGER,
    p_matricula  TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_oper     rast_operadores;
    v_setor    rast_setores;
    v_pal      rast_paletes;
    v_destino  rast_op_roteiro;
    v_ultimo   RECORD;
    v_tipo     TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login no sistema antes de bipar.';
    END IF;

    v_oper := rast_operador_ativo(p_matricula);

    SELECT * INTO v_setor FROM rast_setores WHERE id = p_setor_id AND ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Setor da estação não encontrado. Escolha o setor no topo da tela.';
    END IF;

    SELECT * INTO v_pal FROM rast_paletes WHERE codigo = upper(trim(p_codigo)) FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Palete % não encontrado. Confira se bipou o código da ficha certa ou digite o código impresso embaixo do código de barras.', p_codigo;
    END IF;

    IF v_pal.situacao IN ('consumido', 'finalizado', 'cancelado') THEN
        SELECT e.tipo, e.ocorrido_em, coalesce(s.nome, r.processo) AS onde
          INTO v_ultimo
          FROM rast_palete_eventos e
          LEFT JOIN rast_op_roteiro r ON r.id = e.etapa_id
          LEFT JOIN rast_setores s ON s.id = r.setor_id
         WHERE e.palete_id = v_pal.id
         ORDER BY e.ocorrido_em DESC LIMIT 1;
        RAISE EXCEPTION 'Palete % já foi baixado (% em %, às %). Não use esta ficha de novo. Se o material ainda está aqui, chame o supervisor.',
            v_pal.codigo, v_pal.situacao, coalesce(v_ultimo.onde, '-'), rast_hora_local(v_ultimo.ocorrido_em);
    END IF;

    IF v_pal.situacao = 'em_terceiros' THEN
        RAISE EXCEPTION 'Palete % está no fornecedor. Quando voltar, registre em "Retorno de terceiros" antes de bipar no setor.', v_pal.codigo;
    END IF;

    -- Regra 1: cura.
    IF now() < v_pal.liberado_em THEN
        RAISE EXCEPTION 'Palete % em cura. Libera às %. Deixe o palete na área de cura e bipe depois desse horário.',
            v_pal.codigo, rast_hora_local(v_pal.liberado_em);
    END IF;

    -- Regra 2: destino.
    IF v_pal.etapa_destino_id IS NULL THEN
        -- Passou por todas as etapas: so a expedicao recebe, e la o palete finaliza.
        IF NOT v_setor.expedicao THEN
            RAISE EXCEPTION 'Palete % não é para %. Ele já passou por todas as etapas. Leve o palete para a expedição.', v_pal.codigo, v_setor.nome;
        END IF;
        UPDATE rast_paletes SET situacao = 'finalizado' WHERE id = v_pal.id;
        INSERT INTO rast_palete_eventos (palete_id, tipo, etapa_id, operador_id, quantidade)
        VALUES (v_pal.id, 'finalizado', NULL, v_oper.id, v_pal.quantidade);
        RETURN jsonb_build_object(
            'codigo', v_pal.codigo, 'tipo', 'finalizado', 'quantidade', v_pal.quantidade,
            'unidade', v_pal.unidade, 'etapa', v_setor.nome, 'numero_op', v_pal.numero_op);
    END IF;

    SELECT * INTO v_destino FROM rast_op_roteiro WHERE id = v_pal.etapa_destino_id;

    IF v_setor.expedicao AND v_destino.setor_id IS DISTINCT FROM v_setor.id THEN
        RAISE EXCEPTION 'Palete % ainda não terminou. O destino é %. Leve o palete para lá.',
            v_pal.codigo, rast_nome_destino(v_destino.id);
    END IF;

    IF v_destino.terceiros THEN
        IF NOT v_setor.terceiros THEN
            RAISE EXCEPTION 'Palete % não é para %. O destino é %. Leve o palete para a portaria.',
                v_pal.codigo, v_setor.nome, rast_nome_destino(v_destino.id);
        END IF;
        v_tipo := 'saida_terceiros';
        UPDATE rast_paletes SET situacao = 'em_terceiros' WHERE id = v_pal.id;
    ELSE
        IF v_setor.terceiros OR v_destino.setor_id IS DISTINCT FROM v_setor.id THEN
            RAISE EXCEPTION 'Palete % não é para %. O destino é %. Leve o palete para lá.',
                v_pal.codigo, v_setor.nome, rast_nome_destino(v_destino.id);
        END IF;
        -- Etapa de expedicao que veio no roteiro do Metrics: finaliza.
        IF v_setor.expedicao THEN
            v_tipo := 'finalizado';
            UPDATE rast_paletes SET situacao = 'finalizado' WHERE id = v_pal.id;
        ELSE
            v_tipo := 'consumido';
            UPDATE rast_paletes SET situacao = 'consumido' WHERE id = v_pal.id;
        END IF;
    END IF;

    INSERT INTO rast_palete_eventos (palete_id, tipo, etapa_id, operador_id, quantidade)
    VALUES (v_pal.id, v_tipo, v_destino.id, v_oper.id, v_pal.quantidade);

    RETURN jsonb_build_object(
        'codigo', v_pal.codigo,
        'tipo', v_tipo,
        'quantidade', v_pal.quantidade,
        'unidade', v_pal.unidade,
        'etapa', v_destino.processo,
        'numero_op', v_pal.numero_op
    );
END $$;

-- ---------------------------------------------------------------------------
-- 9. Retorno de terceiros: o mesmo palete volta e segue o roteiro
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_retorno_terceiros(
    p_codigo      TEXT,
    p_matricula   TEXT,
    p_quantidade  NUMERIC,
    p_refugo      NUMERIC DEFAULT 0,
    p_observacao  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_oper     rast_operadores;
    v_pal      rast_paletes;
    v_proxima  UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login no sistema antes de registrar o retorno.';
    END IF;

    v_oper := rast_operador_ativo(p_matricula);

    SELECT * INTO v_pal FROM rast_paletes WHERE codigo = upper(trim(p_codigo)) FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Palete % não encontrado. Digite o código impresso na ficha.', p_codigo;
    END IF;
    IF v_pal.situacao <> 'em_terceiros' THEN
        RAISE EXCEPTION 'Palete % não consta como enviado a terceiros (situação: %). Se ele saiu pela portaria sem bipar, chame o supervisor.',
            v_pal.codigo, v_pal.situacao;
    END IF;
    IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
        RAISE EXCEPTION 'Informe a quantidade que voltou do fornecedor.';
    END IF;
    IF p_quantidade + coalesce(p_refugo, 0) > v_pal.quantidade THEN
        RAISE EXCEPTION 'Voltou mais do que saiu. Saíram %, e o retorno com refugo soma %. Confira a contagem.',
            v_pal.quantidade, p_quantidade + coalesce(p_refugo, 0);
    END IF;

    v_proxima := rast_proxima_etapa(v_pal.etapa_destino_id);

    INSERT INTO rast_palete_eventos (palete_id, tipo, etapa_id, operador_id, quantidade, refugo, observacao)
    VALUES (v_pal.id, 'retorno_terceiros', v_pal.etapa_destino_id, v_oper.id,
            p_quantidade, coalesce(p_refugo, 0), nullif(trim(p_observacao), ''));

    UPDATE rast_paletes
       SET situacao = 'aguardando',
           quantidade = p_quantidade,
           etapa_destino_id = v_proxima
     WHERE id = v_pal.id;

    RETURN jsonb_build_object(
        'codigo', v_pal.codigo,
        'quantidade', p_quantidade,
        'proximo_destino', rast_nome_destino(v_proxima)
    );
END $$;

-- ---------------------------------------------------------------------------
-- 10. Reimpressao (regra 4) e cancelamento
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rast_reimprimir_etiqueta(
    p_palete_id  UUID,
    p_matricula  TEXT
) RETURNS rast_etiquetas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_oper rast_operadores;
    v_etq  rast_etiquetas;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login no sistema antes de reimprimir.';
    END IF;
    v_oper := rast_operador_ativo(p_matricula);

    IF NOT EXISTS (SELECT 1 FROM rast_paletes WHERE id = p_palete_id) THEN
        RAISE EXCEPTION 'Palete não encontrado.';
    END IF;

    INSERT INTO rast_etiquetas (palete_id, motivo, impressa_por)
    VALUES (p_palete_id, 'reimpressao', v_oper.id)
    RETURNING * INTO v_etq;
    RETURN v_etq;
END $$;

CREATE OR REPLACE FUNCTION rast_cancelar_palete(
    p_palete_id  UUID,
    p_matricula  TEXT,
    p_motivo     TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_oper rast_operadores;
    v_pal  rast_paletes;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Faça login no sistema antes de cancelar.';
    END IF;
    v_oper := rast_operador_ativo(p_matricula);

    IF coalesce(trim(p_motivo), '') = '' THEN
        RAISE EXCEPTION 'Escreva o motivo do cancelamento.';
    END IF;

    SELECT * INTO v_pal FROM rast_paletes WHERE id = p_palete_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Palete não encontrado.';
    END IF;
    IF v_pal.situacao <> 'aguardando' THEN
        RAISE EXCEPTION 'Palete % não pode ser cancelado porque já está %. Chame o supervisor.', v_pal.codigo, v_pal.situacao;
    END IF;

    UPDATE rast_paletes SET situacao = 'cancelado' WHERE id = v_pal.id;
    -- O material que ele tinha tirado dos paletes de entrada volta para o saldo.
    UPDATE rast_alocacoes SET estornado = true WHERE palete_id = v_pal.id;
    INSERT INTO rast_palete_eventos (palete_id, tipo, etapa_id, operador_id, quantidade, observacao)
    VALUES (v_pal.id, 'cancelado', v_pal.etapa_origem_id, v_oper.id, v_pal.quantidade, trim(p_motivo));
END $$;

-- ---------------------------------------------------------------------------
-- 11. Rastro do palete: por onde o material passou e quem mexeu
-- ---------------------------------------------------------------------------
-- Uma linha por etapa anterior (nivel 1 = paletes de onde este saiu direto,
-- nivel 2 = de onde aqueles sairam...). Vai na ficha e na lista de paletes.

CREATE OR REPLACE FUNCTION rast_rastro(p_palete_id UUID)
RETURNS TABLE (
    nivel           INTEGER,
    setor           TEXT,
    processo        TEXT,
    codigos         TEXT[],
    operadores      TEXT[],
    maquinas        TEXT[],
    produzido_de    TIMESTAMPTZ,
    produzido_ate   TIMESTAMPTZ,
    terceiros       TEXT[],
    bipado_por      TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH RECURSIVE anc(id, nivel) AS (
        SELECT a.origem_id, 1
          FROM rast_alocacoes a
         WHERE a.palete_id = p_palete_id AND NOT a.estornado
        UNION
        SELECT a.origem_id, anc.nivel + 1
          FROM rast_alocacoes a
          JOIN anc ON a.palete_id = anc.id
         WHERE NOT a.estornado
    ),
    uniq AS (SELECT id, min(nivel) AS nivel FROM anc GROUP BY id),
    info AS (
        SELECT u.nivel, p.*,
               o.matricula || ' ' || o.nome AS operador,
               (SELECT oc.matricula || ' ' || oc.nome
                  FROM rast_palete_eventos ec JOIN rast_operadores oc ON oc.id = ec.operador_id
                 WHERE ec.palete_id = p.id AND ec.tipo = 'consumido'
                 LIMIT 1) AS bipou,
               (SELECT string_agg(regexp_replace(r2.processo, '\s*\(terceiros\)', '', 'i'), ', ')
                  FROM rast_palete_eventos e2 JOIN rast_op_roteiro r2 ON r2.id = e2.etapa_id
                 WHERE e2.palete_id = p.id AND e2.tipo = 'retorno_terceiros') AS terc
          FROM uniq u
          JOIN rast_paletes p    ON p.id = u.id
          JOIN rast_operadores o ON o.id = p.operador_id
    )
    SELECT i.nivel, s.nome, r.processo,
           array_agg(DISTINCT i.codigo),
           array_agg(DISTINCT i.operador),
           coalesce(array_agg(DISTINCT i.maquina) FILTER (WHERE i.maquina IS NOT NULL), '{}'),
           min(i.produzido_em), max(i.produzido_em),
           coalesce(array_agg(DISTINCT i.terc) FILTER (WHERE i.terc IS NOT NULL), '{}'),
           coalesce(array_agg(DISTINCT i.bipou) FILTER (WHERE i.bipou IS NOT NULL), '{}')
      FROM info i
      JOIN rast_setores s    ON s.id = i.setor_origem_id
      JOIN rast_op_roteiro r ON r.id = i.etapa_origem_id
     GROUP BY i.nivel, s.nome, r.processo, r.seq
     ORDER BY i.nivel DESC, r.seq;
$$;

-- ---------------------------------------------------------------------------
-- 12. Permissoes das funcoes
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION rast_operador_ativo(TEXT)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_proxima_etapa(UUID)                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_fila_entrada(INTEGER, INTEGER, TEXT, NUMERIC)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_saldo_entrada(INTEGER, INTEGER, TEXT, NUMERIC)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_alocar(UUID, INTEGER, INTEGER, NUMERIC, TEXT, NUMERIC)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rast_rastro(UUID)                                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_nome_destino(UUID)                                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_criar_paletes(UUID, TEXT, TEXT, NUMERIC[], NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_bipar_palete(TEXT, INTEGER, TEXT)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_retorno_terceiros(TEXT, TEXT, NUMERIC, NUMERIC, TEXT)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_reimprimir_etiqueta(UUID, TEXT)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION rast_cancelar_palete(UUID, TEXT, TEXT)                       FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION rast_proxima_etapa(UUID)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION rast_saldo_entrada(INTEGER, INTEGER, TEXT, NUMERIC)          TO authenticated;
GRANT EXECUTE ON FUNCTION rast_rastro(UUID)                                            TO authenticated;
GRANT EXECUTE ON FUNCTION rast_nome_destino(UUID)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION rast_importar_op(JSONB, JSONB, JSONB, TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION rast_criar_paletes(UUID, TEXT, TEXT, NUMERIC[], NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rast_bipar_palete(TEXT, INTEGER, TEXT)                       TO authenticated;
GRANT EXECUTE ON FUNCTION rast_retorno_terceiros(TEXT, TEXT, NUMERIC, NUMERIC, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION rast_reimprimir_etiqueta(UUID, TEXT)                         TO authenticated;
GRANT EXECUTE ON FUNCTION rast_cancelar_palete(UUID, TEXT, TEXT)                       TO authenticated;
