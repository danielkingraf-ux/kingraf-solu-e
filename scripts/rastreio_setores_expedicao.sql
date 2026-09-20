-- Encaixotamento e Paletizacao aparecem no fim de toda OP do Metrics e sao a
-- expedicao. Sem isso o PCP precisa escolher o setor na mao a cada importacao.
--
-- Rodar uma vez no SQL Editor. Ja vem embutido na migration para instalacao nova.

UPDATE rast_setores
   SET palavras_chave = ARRAY['expedi', 'encaixot', 'paletiz']
 WHERE sigla = 'EXP';

SELECT nome, sigla, palavras_chave FROM rast_setores ORDER BY ordem;
