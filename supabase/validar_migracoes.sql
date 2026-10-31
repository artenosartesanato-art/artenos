-- Validação das migrações de outubro/2026 (somente leitura: não altera nada).
-- Rode no SQL Editor DEPOIS dos 11 scripts de docs/MIGRACOES-2026-10.md.
-- Resultado: uma linha por verificação. Tudo certo = todas as linhas com "OK".
-- As linhas com "FALTA" ou "ATENÇÃO" aparecem primeiro e dizem qual script rodar de novo.

with
-- 1) Tabelas que precisam existir (e com RLS ligado).
tabelas(script, nome) as (values
  ('01 validacao_textos_loja', 'profiles'),
  ('03 moderacao_chat', 'moderation_blocked_terms'),
  ('03 moderacao_chat', 'moderation_attempts'),
  ('03 moderacao_chat', 'moderation_suspensions'),
  ('03 moderacao_chat', 'conversation_reports'),
  ('06 comprar_agora', 'buy_now_intents'),
  ('07 avaliacoes', 'product_reviews'),
  ('07 avaliacoes', 'store_reviews'),
  ('09 central_ajuda', 'rate_limit_events'),
  ('09 central_ajuda', 'support_tickets'),
  ('10 seguranca_privacidade', 'access_logs'),
  ('11 notas_fiscais', 'invoice_settings'),
  ('11 notas_fiscais', 'seller_fiscal_profiles'),
  ('11 notas_fiscais', 'invoice_jobs')
),
-- 2) Colunas novas em tabelas que já existiam.
colunas(script, tabela, coluna) as (values
  ('02 disponibilidade_estoque', 'products', 'availability'),
  ('02 disponibilidade_estoque', 'checkout_items', 'made_to_order'),
  ('02 disponibilidade_estoque', 'order_items', 'made_to_order'),
  ('05 descricao_observacoes', 'cart_items', 'customer_notes'),
  ('05 descricao_observacoes', 'checkout_items', 'customer_notes'),
  ('05 descricao_observacoes', 'checkout_items', 'product_summary'),
  ('05 descricao_observacoes', 'order_items', 'customer_notes'),
  ('05 descricao_observacoes', 'order_items', 'product_summary'),
  ('06 comprar_agora', 'checkouts', 'source'),
  ('07 avaliacoes', 'orders', 'delivered_at'),
  ('07 avaliacoes', 'orders', 'review_reminder_sent_at'),
  ('07 avaliacoes', 'products', 'rating_avg'),
  ('07 avaliacoes', 'products', 'rating_count'),
  ('07 avaliacoes', 'artisan_store_settings', 'rating_avg'),
  ('07 avaliacoes', 'artisan_store_settings', 'rating_count'),
  ('08 status_encomenda', 'order_items', 'production_status'),
  ('08 status_encomenda', 'order_items', 'production_updated_at'),
  ('11 notas_fiscais', 'orders', 'nf_status'),
  ('11 notas_fiscais', 'orders', 'nf_numero'),
  ('11 notas_fiscais', 'orders', 'nf_url_pdf'),
  ('11 notas_fiscais', 'orders', 'nf_xml'),
  ('11 notas_fiscais', 'orders', 'nf_erro'),
  ('11 notas_fiscais', 'orders', 'invoice_number'),
  ('11 notas_fiscais', 'orders', 'invoice_url'),
  ('11 notas_fiscais', 'products', 'ncm'),
  ('11 notas_fiscais', 'products', 'cfop')
),
-- 3) Funções (assinatura exata).
funcoes(script, assinatura) as (values
  ('01 validacao_textos_loja', 'public.is_meaningful_text(text,integer)'),
  ('02 disponibilidade_estoque', 'public.compute_product_availability(integer,uuid)'),
  ('02 disponibilidade_estoque', 'public.product_max_quantity(public.products)'),
  ('02 disponibilidade_estoque', 'public.add_to_cart(uuid,integer)'),
  ('02 disponibilidade_estoque', 'public.set_cart_quantity(uuid,integer)'),
  ('03 moderacao_chat', 'public.moderation_find_term(text)'),
  ('03 moderacao_chat', 'public.moderation_assert_clean(text)'),
  ('03 moderacao_chat', 'public.send_chat_message(uuid,text,text,uuid)'),
  ('03 moderacao_chat', 'public.report_conversation(uuid,text,text)'),
  ('03 moderacao_chat', 'public.admin_list_conversation_reports(text)'),
  ('05 descricao_observacoes', 'public.text_summary(text,integer)'),
  ('05 descricao_observacoes', 'public.set_cart_item_notes(uuid,text)'),
  ('05 descricao_observacoes', 'public.list_cart()'),
  ('06 comprar_agora', 'public.start_buy_now(uuid,integer)'),
  ('06 comprar_agora', 'public.set_buy_now_notes(text)'),
  ('06 comprar_agora', 'public.get_buy_now()'),
  ('06 comprar_agora', 'public.get_cart_shipping_packages(text,text)'),
  ('06 comprar_agora', 'public.create_checkout_from_item(uuid)'),
  ('06 comprar_agora', 'public.create_checkout_from_cart()'),
  ('06 comprar_agora', 'public.finalize_checkout(uuid,text,text,numeric,numeric,integer)'),
  ('07 avaliacoes', 'public.submit_product_review(uuid,integer,text)'),
  ('07 avaliacoes', 'public.submit_store_review(uuid,integer,text)'),
  ('07 avaliacoes', 'public.reply_to_review(text,uuid,text)'),
  ('07 avaliacoes', 'public.list_product_reviews(uuid,integer,integer)'),
  ('07 avaliacoes', 'public.list_store_reviews(uuid,integer,integer)'),
  ('07 avaliacoes', 'public.list_my_reviewables()'),
  ('07 avaliacoes', 'public.list_my_received_reviews()'),
  ('07 avaliacoes', 'public.claim_review_reminders(integer)'),
  ('07 avaliacoes', 'public.get_products_availability(uuid[])'),
  ('07 avaliacoes', 'public.search_storefront_products(text,uuid,uuid,text,integer)'),
  ('08 status_encomenda', 'public.update_order_item_production(uuid,text)'),
  ('08 status_encomenda', 'public.list_order_item_details(uuid[])'),
  ('08 status_encomenda', 'public.list_my_open_custom_orders()'),
  ('08 status_encomenda', 'public.list_store_custom_order_services(uuid)'),
  ('08 status_encomenda', 'public.browse_storefront_products(text,uuid,numeric,numeric,boolean,text,integer,integer,text)'),
  ('09 central_ajuda', 'public.rate_limit_hit(text,text,integer,integer)'),
  ('09 central_ajuda', 'public.admin_list_support_tickets(text)'),
  ('10 seguranca_privacidade', 'public.account_deletion_blockers(uuid)'),
  ('10 seguranca_privacidade', 'public.anonymize_account(uuid)'),
  ('10 seguranca_privacidade', 'public.purge_expired_records()'),
  ('11 notas_fiscais', 'public.claim_invoice_jobs(integer)'),
  ('11 notas_fiscais', 'public.invoice_context(uuid)'),
  ('11 notas_fiscais', 'public.finish_invoice_job(uuid,text,text,text,text,text,text,integer)'),
  ('11 notas_fiscais', 'public.save_my_fiscal_profile(jsonb)'),
  ('11 notas_fiscais', 'public.set_my_product_fiscal(uuid,text,text,integer)')
),
-- 4) Gatilhos (triggers).
gatilhos(script, tabela, nome) as (values
  ('01 validacao_textos_loja', 'profiles', 'validate_store_story'),
  ('02 disponibilidade_estoque', 'products', 'derive_product_availability'),
  ('02 disponibilidade_estoque', 'artisan_store_settings', 'refresh_store_products_availability'),
  ('03 moderacao_chat', 'messages', 'moderate_message'),
  ('03 moderacao_chat', 'profiles', 'moderate_profile_texts'),
  ('03 moderacao_chat', 'products', 'moderate_product_texts'),
  ('05 descricao_observacoes', 'checkout_items', 'fill_checkout_item_context'),
  ('05 descricao_observacoes', 'order_items', 'fill_order_item_context'),
  ('07 avaliacoes', 'product_reviews', 'refresh_product_rating'),
  ('07 avaliacoes', 'store_reviews', 'refresh_store_rating'),
  ('07 avaliacoes', 'orders', 'stamp_order_delivered'),
  ('08 status_encomenda', 'order_items', 'start_item_production_status'),
  ('10 seguranca_privacidade', 'messages', 'rate_limit_messages'),
  ('10 seguranca_privacidade', 'product_reviews', 'rate_limit_product_reviews'),
  ('11 notas_fiscais', 'orders', 'enqueue_invoice_job'),
  ('11 notas_fiscais', 'products', 'require_fiscal_data_to_publish')
),
-- Tabelas com dados sensíveis que o navegador NÃO pode ler direto.
privadas(nome) as (values
  ('access_logs'), ('support_tickets'), ('moderation_attempts'), ('moderation_suspensions'),
  ('conversation_reports'), ('rate_limit_events'), ('invoice_jobs'), ('seller_fiscal_profiles'),
  ('buy_now_intents'), ('product_reviews'), ('store_reviews'), ('moderation_blocked_terms'), ('invoice_settings')
),
checagens as (
  select t.script, 'tabela' as tipo, t.nome as item,
    case when to_regclass('public.' || t.nome) is null then 'FALTA'
         when not (select relrowsecurity from pg_class where oid = to_regclass('public.' || t.nome)) then 'ATENÇÃO: RLS desligado'
         else 'OK' end as status
  from tabelas t
  union all
  select c.script, 'coluna', c.tabela || '.' || c.coluna,
    case when exists (select 1 from information_schema.columns i
                      where i.table_schema = 'public' and i.table_name = c.tabela and i.column_name = c.coluna)
         then 'OK' else 'FALTA' end
  from colunas c
  union all
  select f.script, 'função', f.assinatura,
    case when to_regprocedure(f.assinatura) is null then 'FALTA' else 'OK' end
  from funcoes f
  union all
  select g.script, 'gatilho', g.tabela || ' → ' || g.nome,
    case when exists (select 1 from pg_trigger tg where not tg.tgisinternal and tg.tgname = g.nome
                      and tg.tgrelid = to_regclass('public.' || g.tabela))
         then 'OK' else 'FALTA' end
  from gatilhos g
  union all
  -- Privilégios: nenhuma permissão direta de anon/authenticated nas tabelas privadas.
  select '03..11 (permissões)', 'acesso direto', p.nome,
    coalesce((select 'ATENÇÃO: ' || string_agg(distinct grantee || ' ' || privilege_type, ', ')
              from information_schema.role_table_grants r
              where r.table_schema = 'public' and r.table_name = p.nome and r.grantee in ('anon', 'authenticated')), 'OK')
  from privadas p
  union all
  -- Conteúdo mínimo esperado.
  select '04 moderacao_termos', 'dados', 'termos bloqueados cadastrados',
    case when to_regclass('public.moderation_blocked_terms') is null then 'FALTA'
         when (select count(*) from public.moderation_blocked_terms) = 0 then 'FALTA: rode moderacao_termos.sql'
         else 'OK' end
  union all
  select '11 notas_fiscais', 'dados', 'linha de invoice_settings',
    case when to_regclass('public.invoice_settings') is null then 'FALTA'
         when not exists (select 1 from public.invoice_settings where id = 1) then 'FALTA'
         else 'OK' end
  union all
  select '02 disponibilidade_estoque', 'dados', 'peças com availability calculada',
    case when not exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'products' and column_name = 'availability') then 'FALTA'
         when exists (select 1 from public.products where coalesce(stock, 0) > 0 and not ready_to_ship) then 'ATENÇÃO: há peça com estoque e sem pronta entrega'
         else 'OK' end
  union all
  -- Avisos em tempo real (contador e som de mensagens novas): supabase/notificacoes.sql.
  select 'notificacoes.sql', 'tabela', 'notifications',
    case when to_regclass('public.notifications') is null then 'FALTA: rode supabase/notificacoes.sql' else 'OK' end
  union all
  select 'notificacoes.sql', 'permissão', 'leitura de notifications por quem está conectado',
    case when to_regclass('public.notifications') is null then 'FALTA: rode supabase/notificacoes.sql'
         when has_table_privilege('authenticated', 'public.notifications', 'SELECT') then 'OK'
         else 'FALTA: rode migrations/20261104_notificacoes_permissao.sql' end
  union all
  select 'notificacoes.sql', 'gatilho', 'aviso de mensagem nova (notify_new_message)',
    case when exists (select 1 from pg_trigger where tgname = 'notify_new_message' and not tgisinternal) then 'OK'
         else 'FALTA: rode supabase/notificacoes.sql' end
  union all
  select 'notificacoes.sql', 'tempo real', 'notifications na publicação supabase_realtime',
    case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'notifications') then 'OK'
         else 'FALTA: rode supabase/notificacoes.sql' end
  union all
  select '20261031 exclusao_30_dias', 'coluna', 'profiles.account_status',
    case when exists (select 1 from information_schema.columns where table_schema = 'public'
                        and table_name = 'profiles' and column_name = 'account_status') then 'OK'
         else 'FALTA: rode migrations/20261031_exclusao_30_dias.sql' end
  union all
  select '20261102/20261103 sob encomenda', 'função', 'opções na vitrine e contador das categorias',
    case when to_regprocedure('public.list_public_custom_order_services(integer)') is null then 'FALTA: rode migrations/20261102_opcoes_sob_encomenda_categoria.sql'
         when to_regprocedure('public.list_storefront_categories_with_counts()') is null then 'FALTA: rode migrations/20261103_contagem_categorias.sql'
         else 'OK' end
  union all
  select '20261105 frete_assinatura', 'função', 'frete não expira ao pagar de novo (assinatura sem updated_at)',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname in ('current_buy_now_signature', 'current_cart_shipping_signature')
                         and p.prosrc ilike '%updated_at%') then 'FALTA: rode migrations/20261105_frete_assinatura.sql'
         else 'OK' end
  union all
  select '20261106 cliente_vira_vendedor', 'função', 'cliente abre loja na mesma conta',
    case when to_regprocedure('public.request_seller_profile(text,text,text)') is null
           or not exists (select 1 from pg_constraint where conname = 'artisan_applications_submission_type_check'
                            and pg_get_constraintdef(oid) ilike '%upgrade%')
         then 'FALTA: rode migrations/20261106_cliente_vira_vendedor.sql' else 'OK' end
  union all
  select '20261107 moderacao_especialidade', 'gatilho', 'filtro de termos na especialidade e no cadastro',
    case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'moderate_profile_texts' and p.prosrc ilike '%specialty%')
          and exists (select 1 from pg_trigger t where t.tgname = 'moderate_profile_texts' and not t.tgisinternal
                       and t.tgtype & 4 = 4)
         then 'OK' else 'FALTA: rode migrations/20261107_moderacao_especialidade.sql' end
  union all
  select '20261108 foto_perfil_loja', 'função', 'foto de perfil da loja',
    case when to_regprocedure('public.set_my_store_logo(text)') is null or to_regprocedure('public.list_store_logos(uuid[])') is null
         then 'FALTA: rode migrations/20261108_foto_perfil_loja.sql' else 'OK' end
  union all
  -- Sobrecargas duplicadas deixam chamadas ambíguas (acontece ao rodar um script antigo depois de um novo).
  select 'ordem dos scripts', 'sobrecarga', p.proname,
    case when count(*) > 1 then 'ATENÇÃO: ' || count(*) || ' versões; rode de novo os scripts a partir do 06' else 'OK' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('browse_storefront_products', 'get_cart_shipping_packages', 'list_cart', 'list_order_item_details')
  group by p.proname
)
select status, script, tipo, item
from checagens
order by (status = 'OK'), script, tipo, item;
