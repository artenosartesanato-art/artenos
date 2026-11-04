-- Verifica se os scripts do painel foram executados neste banco.
-- So le o banco: nao cria, nao altera e nao apaga nada.
-- Como usar: apague tudo do SQL Editor, cole este arquivo INTEIRO e clique
-- em Run sem nenhum trecho selecionado.
-- Resultado: uma linha por item, com OK ou FALTA e o script que resolve.

select
  case when ok then 'OK' else 'FALTA' end as situacao,
  item,
  case when ok then '' else 'Execute supabase/' || script end as como_resolver
from (
  select 1 as ordem, 'notificacoes.sql' as script, 'Tabela de notificacoes' as item,
    to_regclass('public.notifications') is not null as ok
  union all
  select 2, 'notificacoes.sql', 'Aviso de nova mensagem',
    exists (select 1 from pg_trigger where tgname = 'notify_new_message' and not tgisinternal)
  union all
  select 3, 'notificacoes.sql', 'Aviso de mensagem abre o painel da loja',
    coalesce(position('approval_status' in pg_get_functiondef(to_regprocedure('public.notify_new_message()'))) > 0, false)
  union all
  select 4, 'notificacoes.sql', 'Avisos de peca salva (preco e estoque)',
    exists (select 1 from pg_trigger where tgname = 'notify_saved_product_change' and not tgisinternal)
  union all
  select 5, 'notificacoes.sql', 'Tipo produto liberado nas notificacoes',
    exists (select 1 from pg_constraint where conname = 'notifications_kind_check'
      and position('produto' in pg_get_constraintdef(oid)) > 0)
  union all
  select 6, 'notificacoes.sql', 'Notificacoes em tempo real',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications')
  union all
  select 7, 'mensagens.sql', 'Mensagens em tempo real',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages')
  union all
  select 10, 'painel_admin_completo.sql', 'Painel admin: visao geral',
    to_regprocedure('public.admin_dashboard(integer)') is not null
  union all
  select 11, 'painel_admin_completo.sql', 'Painel admin: vendedores',
    to_regprocedure('public.admin_list_sellers(text, text, integer, integer)') is not null
    and to_regprocedure('public.admin_seller_detail(uuid)') is not null
    and to_regprocedure('public.admin_seller_action(uuid, text, text, text)') is not null
  union all
  select 12, 'painel_admin_completo.sql', 'Painel admin: pedidos e clientes',
    to_regprocedure('public.admin_list_orders(text, text, integer, integer)') is not null
    and to_regprocedure('public.admin_list_clients(text, integer, integer)') is not null
  union all
  select 13, 'painel_admin_completo.sql', 'Painel admin: categorias',
    to_regprocedure('public.admin_list_categories()') is not null
    and to_regprocedure('public.admin_save_category(uuid, text, text, text, integer, boolean)') is not null
  union all
  select 14, 'painel_admin_completo.sql', 'Painel admin: equipe e atividade',
    to_regprocedure('public.admin_list_team()') is not null
    and to_regprocedure('public.admin_save_team_member(text, text, boolean)') is not null
    and to_regprocedure('public.admin_recent_activity(integer)') is not null
  union all
  select 20, 'administracao_aprovacao.sql', 'Cadastro de administradores',
    to_regclass('public.admin_users') is not null and to_regprocedure('public.is_active_admin()') is not null
  union all
  select 21, 'painel_administrativo.sql', 'Fila de aprovacao de lojas',
    to_regprocedure('public.admin_manage_artisan_application(uuid, text, text, text)') is not null
  union all
  select 22, 'tarifa_plataforma.sql', 'Tarifa da plataforma',
    to_regprocedure('public.get_admin_platform_fee()') is not null
  union all
  select 25, 'login_google.sql', 'Conclusao do cadastro com Google',
    to_regprocedure('public.complete_oauth_signup(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean)') is not null
    and to_regprocedure('public.my_signup_status()') is not null
  union all
  select 26, 'login_google.sql', 'Validacao de CPF, CNPJ e telefone no banco',
    to_regprocedure('public.valid_cpf(text)') is not null
    and to_regprocedure('public.valid_cnpj(text)') is not null
    and to_regprocedure('public.valid_brazilian_phone(text)') is not null
  union all
  select 30, 'criar_admin.sql', 'Conta artenosartesanato@gmail.com com e-mail confirmado',
    exists (select 1 from auth.users where lower(email) = 'artenosartesanato@gmail.com' and email_confirmed_at is not null)
  union all
  select 31, 'criar_admin.sql', 'Essa conta e proprietaria ativa do painel',
    to_regclass('public.admin_users') is not null and exists (
      select 1 from auth.users u join public.admin_users a on a.user_id = u.id
      where lower(u.email) = 'artenosartesanato@gmail.com' and a.active and a.role = 'owner')
) checks
order by ok, ordem;
