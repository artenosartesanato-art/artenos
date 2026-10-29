-- Verifica se os scripts do painel foram executados neste banco.
-- Só LÊ: não cria, não altera e não apaga nada. Pode rodar quantas vezes quiser.
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Resultado: uma linha por item, com "OK" ou "FALTA" e o script que resolve.
with checks(ordem, script, item, ok) as (
  values
  -- supabase/notificacoes.sql ---------------------------------------------
  (1, 'notificacoes.sql', 'Tabela de notificações',
    to_regclass('public.notifications') is not null),
  (2, 'notificacoes.sql', 'Aviso de nova mensagem (gatilho)',
    exists (select 1 from pg_trigger where tgname = 'notify_new_message' and not tgisinternal)),
  (3, 'notificacoes.sql', 'Aviso de mensagem abre o painel da loja (versão atual)',
    coalesce(pg_get_functiondef(to_regprocedure('public.notify_new_message()')) like '%approval_status = ''active''%', false)),
  (4, 'notificacoes.sql', 'Avisos de peça salva (preço, estoque)',
    exists (select 1 from pg_trigger where tgname = 'notify_saved_product_change' and not tgisinternal)),
  (5, 'notificacoes.sql', 'Tipo "produto" liberado nas notificações',
    exists (select 1 from pg_constraint where conname = 'notifications_kind_check'
      and pg_get_constraintdef(oid) like '%produto%')),
  (6, 'notificacoes.sql', 'Notificações em tempo real (Realtime)',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications')),
  (7, 'mensagens.sql', 'Mensagens em tempo real (Realtime)',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages')),
  -- supabase/painel_admin_completo.sql ----------------------------------
  (10, 'painel_admin_completo.sql', 'Visão geral (admin_dashboard)',
    to_regprocedure('public.admin_dashboard(integer)') is not null),
  (11, 'painel_admin_completo.sql', 'Vendedores (lista, ficha e suspender)',
    to_regprocedure('public.admin_list_sellers(text, text, integer, integer)') is not null
    and to_regprocedure('public.admin_seller_detail(uuid)') is not null
    and to_regprocedure('public.admin_seller_action(uuid, text, text, text)') is not null),
  (12, 'painel_admin_completo.sql', 'Pedidos e clientes',
    to_regprocedure('public.admin_list_orders(text, text, integer, integer)') is not null
    and to_regprocedure('public.admin_list_clients(text, integer, integer)') is not null),
  (13, 'painel_admin_completo.sql', 'Categorias (lista e salvar)',
    to_regprocedure('public.admin_list_categories()') is not null
    and to_regprocedure('public.admin_save_category(uuid, text, text, text, integer, boolean)') is not null),
  (14, 'painel_admin_completo.sql', 'Equipe e atividade',
    to_regprocedure('public.admin_list_team()') is not null
    and to_regprocedure('public.admin_save_team_member(text, text, boolean)') is not null
    and to_regprocedure('public.admin_recent_activity(integer)') is not null),
  (15, 'painel_admin_completo.sql', 'Funções do admin fechadas para visitantes (anon)',
    to_regprocedure('public.admin_dashboard(integer)') is not null
    and not has_function_privilege('anon', 'public.admin_dashboard(integer)', 'execute')),
  -- scripts anteriores de que o painel depende ---------------------------
  (20, 'administracao_aprovacao.sql', 'Cadastro de administradores (admin_users)',
    to_regclass('public.admin_users') is not null and to_regprocedure('public.is_active_admin()') is not null),
  (21, 'painel_administrativo.sql', 'Fila de aprovação de lojas',
    to_regprocedure('public.admin_manage_artisan_application(uuid, text, text, text)') is not null),
  (22, 'tarifa_plataforma.sql', 'Tarifa da plataforma',
    to_regprocedure('public.get_admin_platform_fee()') is not null),
  -- supabase/criar_admin.sql ---------------------------------------------
  (30, 'criar_admin.sql', 'Conta artenosartesanato@gmail.com existe e tem e-mail confirmado',
    exists (select 1 from auth.users where lower(email) = 'artenosartesanato@gmail.com'
      and email_confirmed_at is not null)),
  (31, 'criar_admin.sql', 'Essa conta é proprietária ativa do painel',
    to_regclass('public.admin_users') is not null and exists (
      select 1 from auth.users u join public.admin_users a on a.user_id = u.id
      where lower(u.email) = 'artenosartesanato@gmail.com' and a.active and a.role = 'owner'))
)
select
  case when ok then 'OK' else 'FALTA' end as situacao,
  item,
  case when ok then '' else 'Execute supabase/' || script end as como_resolver
from checks
order by ok, ordem;
