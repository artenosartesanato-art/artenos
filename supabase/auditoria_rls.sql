-- Auditoria de controle de acesso (somente leitura: não altera nada).
-- Rode no SQL Editor e confira se o resultado bate com o esperado:
--   * nenhuma tabela pública com RLS desligado (consulta 1 vazia);
--   * tabelas com RLS ligado e sem política só são lidas pelas funções do servidor (consulta 2);
--   * políticas de leitura de pedidos, conversas e mensagens sempre filtram por auth.uid() (consulta 3).

-- 1) Tabelas do schema public SEM row level security.
select c.relname as tabela_sem_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2) Tabelas com RLS e nenhuma política (o navegador não lê nada delas diretamente).
select c.relname as tabela_sem_politica
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
order by 1;

-- 3) Políticas das tabelas com dados de pedidos e conversas.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('orders', 'order_items', 'order_status_history', 'conversations', 'messages',
                    'checkouts', 'checkout_items', 'payouts', 'payout_accounts', 'profiles', 'cart_items')
order by tablename, policyname;

-- 4) Privilégios diretos de anon/authenticated nessas tabelas.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name in ('orders', 'order_items', 'conversations', 'messages', 'checkouts', 'checkout_items',
                     'payouts', 'payout_accounts', 'profiles', 'access_logs', 'support_tickets')
group by table_name, grantee
order by table_name, grantee;
