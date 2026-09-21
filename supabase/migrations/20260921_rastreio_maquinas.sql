-- ============================================================================
-- Hot stamping e relevo moram no corte e vinco, e as maquinas viram cadastro
-- Date: 2026-09-21
--
-- Setor aqui nao e "tipo de servico", e o LUGAR onde tem um coletor e alguem
-- para bipar. Hot stamping e relevo acontecem dentro do corte e vinco: mesma
-- gente, mesmo PC. Quem separa o que foi feito e a ETAPA do roteiro (que
-- continua chamando "Hot Stamping") e a MAQUINA do palete.
--
-- Maquinas do corte e vinco: Bobst 1, Bobst 2, Bobst 3 e a BMA, que e a de hot
-- e as vezes faz relevo.
--
-- Sem isto, um palete com destino "Hot Stamping" era recusado na estacao do
-- corte e vinco, porque o sistema achava que era outro setor.
-- ============================================================================

-- 1. O corte e vinco passa a reconhecer hot stamping e relevo na importacao.
UPDATE rast_setores
   SET palavras_chave = ARRAY['corte e vinco', 'corte/vinco', 'vinco', 'hot stamp', 'hotstamp', 'relevo']
 WHERE sigla = 'CV';

-- 2. Os setores separados saem de cena, sem sumir do historico.
UPDATE rast_setores SET palavras_chave = '{}', ativo = false WHERE sigla IN ('HOT', 'REL');

-- 3. Maquinas: cadastro por setor, para o operador escolher em vez de digitar.
CREATE TABLE IF NOT EXISTS rast_maquinas (
    id        SERIAL PRIMARY KEY,
    setor_id  INTEGER NOT NULL REFERENCES rast_setores(id),
    nome      TEXT NOT NULL,
    ativo     BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (setor_id, nome)
);

COMMENT ON TABLE rast_maquinas IS
    'Maquinas de cada setor. O palete guarda o nome da maquina em texto: trocar a maquina de nome depois nao reescreve ficha ja impressa.';

INSERT INTO rast_maquinas (setor_id, nome)
SELECT s.id, m.nome
  FROM rast_setores s
  JOIN (VALUES ('Bobst 1'), ('Bobst 2'), ('Bobst 3'), ('BMA (hot e relevo)')) AS m(nome) ON true
 WHERE s.sigla = 'CV'
ON CONFLICT (setor_id, nome) DO NOTHING;

ALTER TABLE rast_maquinas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura rast_maquinas" ON rast_maquinas;
CREATE POLICY "Leitura rast_maquinas" ON rast_maquinas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Escrita rast_maquinas" ON rast_maquinas;
CREATE POLICY "Escrita rast_maquinas" ON rast_maquinas
    FOR ALL TO authenticated USING (rast_eh_admin()) WITH CHECK (rast_eh_admin());
