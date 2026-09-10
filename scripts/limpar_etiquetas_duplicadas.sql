-- ============================================================================
-- Limpeza das etiquetas duplicadas pelo comportamento antigo
-- (cada impressao arquivava um registro novo).
--
-- Rodar no SQL Editor do Supabase. CONFIRA o SELECT antes de rodar o DELETE.
-- ============================================================================

-- 1) OLHAR ANTES: quantas duplicatas existem e de quais OPs
SELECT op, cliente, produto, lote, laudo, range_start, range_end,
       count(*) AS copias,
       min(created_at) AS primeira,
       max(created_at) AS ultima
  FROM prod_etiquetas_caixa
 GROUP BY op, cliente, produto, lote, laudo, range_start, range_end
HAVING count(*) > 1
 ORDER BY copias DESC, op;

-- 2) APAGAR AS DUPLICATAS, MANTENDO A MAIS RECENTE DE CADA GRUPO
--    (a mais recente e a que tem os dados mais corretos, ja que reimprimir
--     depois de corrigir algo gerava uma copia nova)
WITH ranqueadas AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY op, cliente, produto, lote, laudo, range_start, range_end
               ORDER BY created_at DESC
           ) AS posicao
      FROM prod_etiquetas_caixa
)
DELETE FROM prod_etiquetas_caixa
 WHERE id IN (SELECT id FROM ranqueadas WHERE posicao > 1);

-- 3) CONFERIR: nao deve sobrar nenhuma linha
SELECT op, lote, laudo, count(*)
  FROM prod_etiquetas_caixa
 GROUP BY op, lote, laudo
HAVING count(*) > 1;


-- ----------------------------------------------------------------------------
-- ALTERNATIVA: zerar o arquivo inteiro
--
-- Apaga TODAS as etiquetas arquivadas. Lote e laudo das OPs NAO sao afetados
-- (moram em prod_op_lote e prod_op_laudo), entao nenhum numero e perdido nem
-- reaproveitado. So o historico de impressao some.
-- Descomente para usar:
-- ----------------------------------------------------------------------------
-- DELETE FROM prod_etiquetas_caixa;
