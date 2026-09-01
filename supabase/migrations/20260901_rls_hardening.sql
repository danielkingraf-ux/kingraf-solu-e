-- Migration: Fecha o acesso anonimo e habilita RLS no modulo de Qualidade
-- Date: 2026-09-01
--
-- Contexto:
-- 1. prod_estoque, prod_tamanhos e prod_usuarios tinham policies "FOR ALL USING (true)"
--    SEM a clausula TO, o que libera leitura e escrita para o papel anon. Como a anon key
--    fica exposta no bundle do front, qualquer visitante alcanca essas tabelas sem login.
-- 2. Nenhuma tabela qual_* tinha RLS habilitada.
--
-- Padrao adotado: mesmo do producao_caixas -- acesso total para authenticated.

/* ---------- 1. Producao: trocar policies abertas por TO authenticated ---------- */

DROP POLICY IF EXISTS "Acesso total prod_estoque"  ON prod_estoque;
DROP POLICY IF EXISTS "Acesso total prod_tamanhos" ON prod_tamanhos;
DROP POLICY IF EXISTS "Acesso total prod_usuarios" ON prod_usuarios;

CREATE POLICY "Acesso total prod_estoque"  ON prod_estoque
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total prod_tamanhos" ON prod_tamanhos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total prod_usuarios" ON prod_usuarios
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

/* ---------- 1b. Etiquetas de caixa ----------
   O estado real do banco divergiu da migration 20260104: as duas policies
   "TO authenticated" foram substituidas no painel por uma unica
   "Allow all operations" para o papel public. Refazendo no padrao. */

DROP POLICY IF EXISTS "Allow all operations"           ON prod_etiquetas_caixa;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON prod_etiquetas_caixa;
DROP POLICY IF EXISTS "Allow select for authenticated" ON prod_etiquetas_caixa;

CREATE POLICY "Acesso total prod_etiquetas_caixa" ON prod_etiquetas_caixa
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

/* ---------- 2. Qualidade: habilitar RLS e criar policies ---------- */

DO $$
DECLARE
    t TEXT;
    tabelas TEXT[] := ARRAY[
        'qual_revisores',
        'qual_setores',
        'qual_tipos_desvios',
        'qual_operadores',
        'qual_maquinas',
        'qual_revisoes',
        'qual_revisao_tempos',
        'qual_revisao_revisores',
        'qual_revisao_desvios',
        'qual_revisao_operadores',
        'qual_revisao_setores'
    ];
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        IF EXISTS (
            SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS "Acesso total %s" ON %I', t, t);
            EXECUTE format(
                'CREATE POLICY "Acesso total %s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
                t, t
            );
        END IF;
    END LOOP;
END $$;

/* ---------- 3. prod_usuarios.senha_hash: alinhar schema com o codigo ---------- */
--
-- As senhas vivem no Supabase Auth (Users.tsx usa supabase.auth.signUp).
-- O insert em prod_usuarios grava apenas id/nome_completo/email/perfil, entao a
-- constraint NOT NULL em senha_hash faz todo cadastro de usuario falhar.

ALTER TABLE prod_usuarios ALTER COLUMN senha_hash DROP NOT NULL;
