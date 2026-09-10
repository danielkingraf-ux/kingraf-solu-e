-- ============================================================================
-- Permissoes que faltavam em prod_etiquetas_caixa
--
-- A tabela nasceu com RLS ligado e SOMENTE policies de INSERT e SELECT. Efeito
-- colateral: o botao "Atualizar" da tela nunca gravou nada — o UPDATE batia em
-- zero linhas e o Supabase devolve sucesso nesse caso, entao a tela avisava
-- "atualizada com sucesso" sem ter atualizado. E nao havia como apagar
-- duplicata nenhuma pela interface.
-- ============================================================================

DROP POLICY IF EXISTS "Allow update for authenticated" ON prod_etiquetas_caixa;
CREATE POLICY "Allow update for authenticated" ON prod_etiquetas_caixa
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete for authenticated" ON prod_etiquetas_caixa;
CREATE POLICY "Allow delete for authenticated" ON prod_etiquetas_caixa
    FOR DELETE TO authenticated USING (true);

GRANT UPDATE, DELETE ON prod_etiquetas_caixa TO authenticated;
