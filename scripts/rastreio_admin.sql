-- Quem administra o Rastreio de Palete.
--
-- RODE ESTE SCRIPT ANTES da migration 20260920_rastreio_admin.sql. Depois dela,
-- conta de Operador nao importa OP nem mexe em cadastro, entao e preciso ter
-- pelo menos um Administrador antes de fechar a porta.
--
-- 1. Troque os e-mails da lista abaixo pelos de quem administra (PCP, supervisao).
-- 2. Rode. A ultima consulta mostra como cada conta ficou.

-- A senha mora no Supabase Auth, nao em prod_usuarios. A coluna senha_hash e
-- resto do sistema antigo e continua NOT NULL neste banco, o que faz qualquer
-- cadastro de usuario falhar. A migration 20260901 ja previa isto, mas esta
-- linha nao chegou a rodar aqui.
ALTER TABLE prod_usuarios ALTER COLUMN senha_hash DROP NOT NULL;

WITH admins(email) AS (
    VALUES
        ('daniel.oliveira@kingraf.com.br')
        -- , ('outro.email@kingraf.com.br')
)
INSERT INTO prod_usuarios (id, nome_completo, email, perfil)
SELECT u.id, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)), u.email, 'Administrador'
  FROM auth.users u
  JOIN admins a ON lower(a.email) = lower(u.email)
ON CONFLICT (email) DO UPDATE SET perfil = 'Administrador';

-- Confira antes de rodar a migration: quem aparece como Administrador aqui
-- continua importando OP e mexendo em cadastro.
SELECT u.email,
       coalesce(u.raw_user_meta_data ->> 'profile', p.perfil, 'Operador') AS perfil_efetivo
  FROM auth.users u
  LEFT JOIN prod_usuarios p ON p.id = u.id OR lower(p.email) = lower(u.email)
 ORDER BY 2 DESC, 1;
