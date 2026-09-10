-- ============================================================================
-- Apagar tudo A PARTIR do lote 85552 e do laudo 42135
--
-- Mantem: lote 85551 e laudo 42134 (a 1a entrega da OP 20144).
-- Depois disso os contadores voltam para 85551 / 42134, entao o proximo
-- cadastro comeca exatamente em lote 85552 e laudo 42135.
--
-- CUIDADO COM AS CHAVES ESTRANGEIRAS
-- O laudo aponta para (op, modelo, sobra) do lote, nao para o numero. Entao
-- nao basta apagar "laudo >= 42135": se um lote >= 85552 tiver um laudo mais
-- ANTIGO pendurado nele, o banco recusa a exclusao do lote. Por isso o passo 2
-- apaga tambem todo laudo que pertenca a um lote que vai sair, qualquer que
-- seja o numero dele.
--
-- NAO TEM VOLTA. Rode o passo 1 e confira antes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. OLHAR ANTES: exatamente o que vai sair
-- ---------------------------------------------------------------------------
SELECT 'lote' AS tipo, op, modelo, sobra, lote::TEXT AS numero, created_at
  FROM prod_op_lote
 WHERE lote >= 85552

UNION ALL

SELECT 'laudo', l.op, l.modelo, l.sobra, l.laudo::TEXT, l.created_at
  FROM prod_op_laudo l
 WHERE l.laudo >= 42135
    OR EXISTS (SELECT 1 FROM prod_op_lote o
                WHERE o.op = l.op AND o.modelo = l.modelo AND o.sobra = l.sobra
                  AND o.lote >= 85552)
 ORDER BY tipo, numero;

-- E o que vai FICAR (confira que sobrou o 85551 / 42134):
SELECT 'lote' AS tipo, op, modelo, lote::TEXT AS numero FROM prod_op_lote  WHERE lote  < 85552
UNION ALL
SELECT 'laudo', op, modelo, laudo::TEXT              FROM prod_op_laudo WHERE laudo < 42135
 ORDER BY tipo, numero;

-- ---------------------------------------------------------------------------
-- 2. APAGAR
--    Ordem obrigatoria: etiquetas -> laudos -> lotes.
-- ---------------------------------------------------------------------------
BEGIN;

-- Etiquetas impressas que citam os numeros que vao sair. O teste de formato
-- evita quebrar em linhas antigas onde o campo nao e numerico.
DELETE FROM prod_etiquetas_caixa e
 WHERE (e.lote  ~ '^[0-9]+$' AND e.lote::BIGINT  >= 85552)
    OR (e.laudo ~ '^[0-9]+$' AND e.laudo::BIGINT >= 42135)
    OR e.laudo_id IN (
        SELECT l.id FROM prod_op_laudo l
         WHERE l.laudo >= 42135
            OR EXISTS (SELECT 1 FROM prod_op_lote o
                        WHERE o.op = l.op AND o.modelo = l.modelo AND o.sobra = l.sobra
                          AND o.lote >= 85552)
    );

-- Laudos: os do corte, MAIS os pendurados em lotes que vao sair.
DELETE FROM prod_op_laudo l
 WHERE l.laudo >= 42135
    OR EXISTS (SELECT 1 FROM prod_op_lote o
                WHERE o.op = l.op AND o.modelo = l.modelo AND o.sobra = l.sobra
                  AND o.lote >= 85552);

DELETE FROM prod_op_lote WHERE lote >= 85552;

-- valor = ultimo numero JA emitido; o proximo e valor + 1.
UPDATE prod_contadores SET valor = 85551, atualizado = now() WHERE nome = 'lote';
UPDATE prod_contadores SET valor = 42134, atualizado = now() WHERE nome = 'laudo';

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. CONFERIR
--    "acima_do_corte" tem que ser 0 nas duas linhas, e "proximo" deve mostrar
--    85552 e 42135.
-- ---------------------------------------------------------------------------
SELECT 'lote'  AS tipo,
       count(*) FILTER (WHERE lote >= 85552)  AS acima_do_corte,
       count(*)                               AS total_restante
  FROM prod_op_lote
UNION ALL
SELECT 'laudo',
       count(*) FILTER (WHERE laudo >= 42135),
       count(*)
  FROM prod_op_laudo;

SELECT nome, valor AS ultimo_emitido, valor + 1 AS proximo
  FROM prod_contadores ORDER BY nome;
