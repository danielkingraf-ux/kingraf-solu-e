-- ============================================================================
-- Papel do operador: quem pode cancelar palete
-- Date: 2026-09-20
--
-- Cancelar palete apaga uma ficha que ja esta no chao e devolve o material ao
-- saldo do setor. Quem faz isso precisa saber o que aconteceu, entao fica com
-- o lider do setor ou com o supervisor. O operador segue criando palete,
-- bipando e reimprimindo ficha rasgada normalmente.
-- ============================================================================

ALTER TABLE rast_operadores
    ADD COLUMN IF NOT EXISTS papel TEXT NOT NULL DEFAULT 'operador';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rast_operadores_papel_check'
    ) THEN
        ALTER TABLE rast_operadores
            ADD CONSTRAINT rast_operadores_papel_check
            CHECK (papel IN ('operador', 'lider', 'supervisor'));
    END IF;
END $$;

COMMENT ON COLUMN rast_operadores.papel IS
    'operador = cria palete, bipa e reimprime. lider e supervisor tambem cancelam palete.';

-- ---------------------------------------------------------------------------
-- Cancelamento: so lider e supervisor
-- ---------------------------------------------------------------------------

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

    IF v_oper.papel NOT IN ('lider', 'supervisor') THEN
        RAISE EXCEPTION 'A matrícula % é de operador e não cancela palete. Chame o líder do setor ou o supervisor, que precisam saber o que aconteceu com a ficha.',
            v_oper.matricula;
    END IF;

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
    VALUES (v_pal.id, 'cancelado', v_pal.etapa_origem_id, v_oper.id, v_pal.quantidade,
            v_oper.papel || ' ' || v_oper.matricula || ': ' || trim(p_motivo));
END $$;

REVOKE ALL ON FUNCTION rast_cancelar_palete(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rast_cancelar_palete(UUID, TEXT, TEXT) TO authenticated;
