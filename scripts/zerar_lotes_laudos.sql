-- ============================================================================
-- RECOMECO DO ZERO
--
-- Apaga TODO o historico de lotes, laudos e etiquetas impressas, e recoloca os
-- contadores no ponto de partida:
--
--     proximo lote  = 85551
--     proximo laudo = 42134
--
-- Assim, a primeira OP que voce usar (a 20144) recebe lote 85551 e laudo 42134
-- naturalmente, e a sequencia segue dali.
--
-- NAO TEM VOLTA. Rode o passo 1 e confira antes de seguir.
-- A ordem dos DELETEs importa: as chaves estrangeiras vao de
-- etiquetas -> laudos -> lotes, entao apaga-se nessa direcao.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. OLHAR ANTES: o que existe hoje
-- ---------------------------------------------------------------------------
SELECT 'lotes'     AS tabela, count(*) AS linhas FROM prod_op_lote
UNION ALL
SELECT 'laudos',   count(*) FROM prod_op_laudo
UNION ALL
SELECT 'etiquetas', count(*) FROM prod_etiquetas_caixa;

SELECT nome, valor AS ultimo_emitido FROM prod_contadores ORDER BY nome;

-- ---------------------------------------------------------------------------
-- 2. APAGAR TUDO E REPOSICIONAR OS CONTADORES
--    Em uma transacao so: ou tudo passa, ou nada muda.
-- ---------------------------------------------------------------------------
BEGIN;

DELETE FROM prod_etiquetas_caixa;
DELETE FROM prod_op_laudo;
DELETE FROM prod_op_lote;

-- valor = ultimo numero JA emitido, entao o proximo e valor + 1.
UPDATE prod_contadores SET valor = 85550, atualizado = now() WHERE nome = 'lote';
UPDATE prod_contadores SET valor = 42133, atualizado = now() WHERE nome = 'laudo';

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. CONFERIR: tres zeros e os contadores no lugar
-- ---------------------------------------------------------------------------
SELECT 'lotes'     AS tabela, count(*) AS linhas FROM prod_op_lote
UNION ALL
SELECT 'laudos',   count(*) FROM prod_op_laudo
UNION ALL
SELECT 'etiquetas', count(*) FROM prod_etiquetas_caixa;

SELECT nome,
       valor          AS ultimo_emitido,
       valor + 1      AS proximo
  FROM prod_contadores
 ORDER BY nome;
