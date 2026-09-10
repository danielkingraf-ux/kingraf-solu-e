-- ============================================================================
-- Numero interno da etiqueta de caixa
--
-- Diferente de lote e laudo, este numero NAO e sequencial nem alocado pelo
-- banco: e digitado pelo operador e impresso com a sigla KING na frente.
-- Fica como texto livre porque o pessoal usa sufixos e letras.
-- ============================================================================

ALTER TABLE prod_etiquetas_caixa
    ADD COLUMN IF NOT EXISTS numero_interno VARCHAR(50);

COMMENT ON COLUMN prod_etiquetas_caixa.numero_interno IS
    'Numero interno digitado pelo operador. Impresso como "KING <valor>".';
