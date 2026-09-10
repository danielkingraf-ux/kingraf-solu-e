-- ============================================================================
-- Apagar uma OP inteira para refazer
--
-- Troque a OP nas tres ocorrencias de '20292' abaixo se for usar de novo.
--
-- A ordem importa: as chaves estrangeiras vao de etiquetas -> laudos -> lotes,
-- entao apaga-se nessa direcao.
--
-- ATENCAO: apagar as linhas NAO devolve os numeros. Os contadores continuam
-- onde estao, entao refazer a OP vai gerar lote e laudo NOVOS, maiores. Se
-- voce precisa que ela volte com os MESMOS numeros, veja o passo 4.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. OLHAR ANTES: o que essa OP tem hoje
-- ---------------------------------------------------------------------------
SELECT 'lote' AS tipo, op, modelo, sobra, lote::TEXT AS numero, created_at
  FROM prod_op_lote  WHERE op = '20292'
UNION ALL
SELECT 'laudo', op, modelo, sobra, laudo::TEXT, created_at
  FROM prod_op_laudo WHERE op = '20292'
 ORDER BY tipo, numero;

SELECT count(*) AS etiquetas_impressas
  FROM prod_etiquetas_caixa WHERE op = '20292';

-- ---------------------------------------------------------------------------
-- 2. APAGAR
-- ---------------------------------------------------------------------------
BEGIN;

DELETE FROM prod_etiquetas_caixa WHERE op = '20292';
DELETE FROM prod_op_laudo        WHERE op = '20292';
DELETE FROM prod_op_lote         WHERE op = '20292';

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. CONFERIR: tem que voltar zero nas tres
-- ---------------------------------------------------------------------------
SELECT
    (SELECT count(*) FROM prod_op_lote         WHERE op = '20292') AS lotes,
    (SELECT count(*) FROM prod_op_laudo        WHERE op = '20292') AS laudos,
    (SELECT count(*) FROM prod_etiquetas_caixa WHERE op = '20292') AS etiquetas;

-- ---------------------------------------------------------------------------
-- 4. OPCIONAL: devolver os numeros a sequencia
--
--    So faca isso se a OP apagada era a ULTIMA a ter gerado numero. Se outra
--    OP pegou numero depois dela, recuar o contador faria o sistema tentar
--    reemitir um numero que ja esta em uso — e a restricao UNIQUE vai barrar.
--
--    Esta consulta diz se e seguro: compara o contador com o maior numero que
--    SOBROU no banco. Se der "pode recuar", os UPDATEs abaixo sao seguros.
-- ---------------------------------------------------------------------------
SELECT c.nome,
       c.valor AS contador,
       CASE c.nome
           WHEN 'lote'  THEN (SELECT coalesce(max(lote), 0)  FROM prod_op_lote)
           WHEN 'laudo' THEN (SELECT coalesce(max(laudo), 0) FROM prod_op_laudo)
       END AS maior_em_uso,
       CASE WHEN c.valor > CASE c.nome
                WHEN 'lote'  THEN (SELECT coalesce(max(lote), 0)  FROM prod_op_lote)
                WHEN 'laudo' THEN (SELECT coalesce(max(laudo), 0) FROM prod_op_laudo)
            END
            THEN 'pode recuar ate o maior_em_uso'
            ELSE 'ja esta no lugar — nao mexer'
       END AS situacao
  FROM prod_contadores c
 ORDER BY c.nome;

-- Descomente para recuar os contadores ate o maior numero que sobrou:
-- UPDATE prod_contadores SET valor = (SELECT coalesce(max(lote), 0)  FROM prod_op_lote),
--        atualizado = now() WHERE nome = 'lote';
-- UPDATE prod_contadores SET valor = (SELECT coalesce(max(laudo), 0) FROM prod_op_laudo),
--        atualizado = now() WHERE nome = 'laudo';
