-- ============================================================================
-- OPs cadastradas com o ano junto ("20144 / 2026" em vez de "20144")
--
-- A OP e a chave de lote e laudo. Digitar o ano junto cria uma OP NOVA no
-- banco: mesma producao, chave diferente, lote e laudo duplicados. Foi o que
-- aconteceu com a 20144 — ela ganhou o lote 85552 ao lado do 85551 que ja
-- tinha.
--
-- A tela ja foi corrigida para ignorar o "/ano" digitado. Este script limpa o
-- que ficou no banco.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. OLHAR ANTES: quais OPs foram gravadas com ano
-- ---------------------------------------------------------------------------
SELECT o.op,
       regexp_replace(o.op, '\s*/\s*(19|20)[0-9]{2}\s*$', '') AS op_correta,
       o.modelo, o.sobra, o.lote,
       (SELECT count(*) FROM prod_op_laudo l
         WHERE l.op = o.op AND l.modelo = o.modelo AND l.sobra = o.sobra) AS laudos,
       (SELECT count(*) FROM prod_etiquetas_caixa e WHERE e.op = o.op) AS etiquetas
  FROM prod_op_lote o
 WHERE o.op ~ '\s*/\s*(19|20)[0-9]{2}\s*$'
 ORDER BY o.lote;

-- A versao correta ja existe? Se aparecer linha aqui, a OP esta duplicada e o
-- caminho e APAGAR a linha com ano (passo 2A). Se nao aparecer, e so
-- RENOMEAR (passo 2B).
SELECT op, modelo, sobra, lote
  FROM prod_op_lote
 WHERE op = '20144'
 ORDER BY lote;

-- ---------------------------------------------------------------------------
-- 2A. DUPLICADA: apagar a linha com ano e devolver o numero
--     Use quando a OP correta JA existe com o mesmo modelo — caso da 20144,
--     em que o 85551 e o bom e o 85552 nasceu por engano.
--     A linha com ano nao tinha laudo ("Sem entrega"); se tiver, o DELETE de
--     laudos abaixo cuida.
-- ---------------------------------------------------------------------------
BEGIN;

DELETE FROM prod_etiquetas_caixa WHERE op ~ '\s*/\s*(19|20)[0-9]{2}\s*$';
DELETE FROM prod_op_laudo        WHERE op ~ '\s*/\s*(19|20)[0-9]{2}\s*$';
DELETE FROM prod_op_lote         WHERE op ~ '\s*/\s*(19|20)[0-9]{2}\s*$';

-- Devolve os numeros liberados a sequencia. Recua so ate o maior EM USO,
-- entao nunca tenta reemitir algo ja gravado.
UPDATE prod_contadores SET valor = (SELECT coalesce(max(lote), 0)  FROM prod_op_lote),
       atualizado = now() WHERE nome = 'lote';
UPDATE prod_contadores SET valor = (SELECT coalesce(max(laudo), 0) FROM prod_op_laudo),
       atualizado = now() WHERE nome = 'laudo';

COMMIT;

-- ---------------------------------------------------------------------------
-- 2B. NAO DUPLICADA: so tirar o ano do nome da OP
--     Use quando a versao sem ano NAO existe — a producao e legitima, so o
--     nome esta errado. NAO rode junto com o 2A.
--     O ON UPDATE CASCADE leva os laudos junto.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- UPDATE prod_op_lote
--    SET op = regexp_replace(op, '\s*/\s*(19|20)[0-9]{2}\s*$', '')
--  WHERE op ~ '\s*/\s*(19|20)[0-9]{2}\s*$';
-- UPDATE prod_etiquetas_caixa
--    SET op = regexp_replace(op, '\s*/\s*(19|20)[0-9]{2}\s*$', '')
--  WHERE op ~ '\s*/\s*(19|20)[0-9]{2}\s*$';
-- COMMIT;

-- ---------------------------------------------------------------------------
-- 3. CONFERIR: nenhuma OP com ano, e os contadores no lugar
-- ---------------------------------------------------------------------------
SELECT count(*) AS ops_com_ano
  FROM prod_op_lote WHERE op ~ '\s*/\s*(19|20)[0-9]{2}\s*$';

SELECT op, modelo, sobra, lote FROM prod_op_lote WHERE op = '20144' ORDER BY lote;

SELECT nome, valor AS ultimo_emitido, valor + 1 AS proximo
  FROM prod_contadores ORDER BY nome;
