-- ============================================================================
-- OP 20292: voltar aos numeros antigos
--
--     lote   85556  ->  85554
--     laudo  42138  ->  42136
--
-- Em vez de apagar e reinserir, RENUMERA as linhas que ja existem. Assim o
-- modelo (KING), cliente, produto, a marca de sobra e os vinculos entre as
-- tabelas ficam intactos — e nao e preciso redigitar nada.
--
-- A chave estrangeira do laudo aponta para (op, modelo, sobra), nao para o
-- numero do lote, entao trocar o numero nao quebra o vinculo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. OLHAR ANTES
--    (a) como a OP esta hoje
--    (b) se os numeros antigos estao livres — se alguma linha aparecer em
--        "ocupado_por", PARE: o UNIQUE vai barrar a troca.
-- ---------------------------------------------------------------------------
SELECT 'lote' AS tipo, op, modelo, sobra, lote::TEXT AS numero, created_at
  FROM prod_op_lote  WHERE op = '20292'
UNION ALL
SELECT 'laudo', op, modelo, sobra, laudo::TEXT, created_at
  FROM prod_op_laudo WHERE op = '20292'
 ORDER BY tipo, numero;

SELECT 'lote 85554'  AS alvo, op AS ocupado_por FROM prod_op_lote  WHERE lote  = 85554
UNION ALL
SELECT 'laudo 42136', op                        FROM prod_op_laudo WHERE laudo = 42136;

-- ---------------------------------------------------------------------------
-- 2. RENUMERAR
--    Inclui prod_etiquetas_caixa: la o lote e o laudo sao texto, e as
--    etiquetas ja arquivadas ficariam apontando para numeros que sumiram.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE prod_op_lote  SET lote  = 85554 WHERE op = '20292' AND lote  = 85556;
UPDATE prod_op_laudo SET laudo = 42136 WHERE op = '20292' AND laudo = 42138;

UPDATE prod_etiquetas_caixa SET lote  = '85554' WHERE op = '20292' AND lote  = '85556';
UPDATE prod_etiquetas_caixa SET laudo = '42136' WHERE op = '20292' AND laudo = '42138';

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. CONFERIR: tem que aparecer 85554 e 42136, e nenhum 85556 / 42138
-- ---------------------------------------------------------------------------
SELECT 'lote' AS tipo, op, modelo, sobra, lote::TEXT AS numero
  FROM prod_op_lote  WHERE op = '20292'
UNION ALL
SELECT 'laudo', op, modelo, sobra, laudo::TEXT
  FROM prod_op_laudo WHERE op = '20292'
 ORDER BY tipo, numero;

-- ---------------------------------------------------------------------------
-- 4. OPCIONAL: recuar os contadores
--
--    85556 e 42138 ficaram livres. Recuar os contadores faz a proxima OP pegar
--    esses numeros em vez de pular para 85557 / 42139.
--
--    So faca isso se NENHUMA outra OP pegou numero depois da 20292. A consulta
--    abaixo responde: se "situacao" disser "pode recuar", os UPDATEs sao
--    seguros; senao, deixe como esta e aceite o buraco na sequencia.
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

-- Descomente so se a consulta acima disser "pode recuar":
-- UPDATE prod_contadores SET valor = (SELECT coalesce(max(lote), 0)  FROM prod_op_lote),
--        atualizado = now() WHERE nome = 'lote';
-- UPDATE prod_contadores SET valor = (SELECT coalesce(max(laudo), 0) FROM prod_op_laudo),
--        atualizado = now() WHERE nome = 'laudo';
