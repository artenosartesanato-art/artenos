-- APAGA TODAS AS CONTAS (e tudo o que é delas), MENOS artenosartesanato@gmail.com.
--
-- Execute no SQL Editor do Supabase. FAÇA UM BACKUP ANTES
-- (Database → Backups): NÃO HÁ COMO DESFAZER.
--
-- APAGA:
--   * contas (login), perfis, nomes, e-mails, CPFs, endereços de clientes e vendedores;
--   * lojas, peças, pedidos, pagamentos/checkouts, repasses, carrinhos,
--     favoritos, conversas e mensagens, avaliações, encomendas, avisos,
--     denúncias, suspensões, chamados da Central de Ajuda, cálculos de preço,
--     dados fiscais, filas de nota fiscal e registros de limite de tentativas;
--   * qualquer outra tabela de dados de uso que exista só no banco de produção.
--
-- MANTÉM:
--   * as TABELAS (a estrutura do banco não muda);
--   * a conta artenosartesanato@gmail.com: login, perfil e acesso de admin
--     (os OUTROS admins são apagados; troque o e-mail em v_email se precisar);
--   * a configuração da plataforma: categorias, coleções, banners, tarifa,
--     lista de termos bloqueados e configuração de nota fiscal.
--
-- Segurança:
--   * se a conta mantida não existir ou não for admin ativa, o script PARA e não apaga nada;
--   * tudo numa transação: se algo falhar, nada é apagado.
--
-- Fotos: o Supabase não deixa apagar arquivos por SQL. Depois de rodar, em
-- Storage, esvazie o bucket "artenos-store-assets" (fotos de peças, capas e
-- fotos das lojas) e, em "artenos-profile-avatars", apague as pastas de quem
-- não são da conta mantida (cada pasta tem o id da conta).
begin;

do $$
declare
  -- ÚNICA conta que fica (login, perfil e acesso de admin).
  v_email constant text := 'artenosartesanato@gmail.com';
  -- Tabelas que NÃO são esvaziadas (a conta mantida e a configuração da plataforma).
  manter text[] := array[
    'profiles', 'admin_users', 'admin_user_audit', 'platform_fee_audit', 'access_logs',
    'platform_pricing_settings', 'storefront_categories', 'storefront_collections', 'storefront_banners',
    'moderation_blocked_terms', 'invoice_settings'
  ];
  v_keep uuid;
  v_users integer;
  alvo text;
begin
  select u.id into v_keep from auth.users u where lower(u.email) = v_email;
  if v_keep is null then
    raise exception 'A conta % não foi encontrada. O script parou e não apagou nada.', v_email;
  end if;
  if not exists (select 1 from public.admin_users a where a.user_id = v_keep and a.active) then
    raise exception 'A conta % não é admin ativa. O script parou para você não perder o acesso ao painel.', v_email;
  end if;
  select count(*) into v_users from auth.users u where u.id <> v_keep;

  -- 1) Dados de uso: esvazia todas as outras tabelas do schema public.
  select string_agg(format('public.%I', c.relname), ', ' order by c.relname)
    into alvo
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname <> all (manter)
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  if alvo is not null then
    execute 'truncate table ' || alvo || ' restart identity';
  end if;

  -- 2) Registros de quem sai: acessos, outros admins e o histórico de tarifa
  --    feito por eles (o banco não deixa apagar a conta enquanto ele existir).
  delete from public.access_logs a where a.user_id is distinct from v_keep;
  delete from public.platform_fee_audit f where f.changed_by <> v_keep;
  delete from public.admin_users a where a.user_id <> v_keep;

  -- 3) Perfis e logins de todos os outros (clientes, vendedores e outros admins).
  delete from public.profiles p where p.id <> v_keep;
  delete from auth.users u where u.id <> v_keep;

  raise notice 'Pronto: % conta(s) apagada(s); ficou só %.', v_users, v_email;
end $$;

commit;

-- Conferência: o que ficou.
select
  (select count(*) from auth.users) as logins_restantes,
  (select string_agg(email, ', ') from auth.users) as conta_que_ficou,
  (select count(*) from public.admin_users) as admins,
  (select count(*) from public.profiles) as perfis_restantes,
  (select count(*) from public.products) as pecas,
  (select count(*) from public.orders) as pedidos,
  (select count(*) from public.storefront_categories) as categorias_mantidas;
