-- APAGA TODOS OS CLIENTES E VENDEDORES (e tudo o que é deles). MANTÉM OS ADMINS.
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
--   * os ADMINS: login, perfil, permissões (admin_users) e históricos da equipe;
--   * a configuração da plataforma: categorias, coleções, banners, tarifa,
--     lista de termos bloqueados e configuração de nota fiscal.
--
-- Segurança:
--   * se não houver nenhum admin ativo, o script PARA e não apaga nada;
--   * tudo numa transação: se algo falhar, nada é apagado.
--
-- Fotos: o Supabase não deixa apagar arquivos por SQL. Depois de rodar, em
-- Storage, esvazie o bucket "artenos-store-assets" (fotos de peças, capas e
-- fotos das lojas) e, em "artenos-profile-avatars", apague as pastas de quem
-- não é admin (cada pasta tem o id da conta).
begin;

do $$
declare
  -- Tabelas que NÃO são esvaziadas (os admins e a configuração da plataforma).
  manter text[] := array[
    'profiles', 'admin_users', 'admin_user_audit', 'platform_fee_audit', 'access_logs',
    'platform_pricing_settings', 'storefront_categories', 'storefront_collections', 'storefront_banners',
    'moderation_blocked_terms', 'invoice_settings'
  ];
  v_admins integer;
  v_users integer;
  alvo text;
begin
  select count(*) into v_admins from public.admin_users where active;
  if v_admins = 0 then
    raise exception 'Nenhum admin ativo encontrado. O script parou para você não perder o acesso ao painel.';
  end if;
  select count(*) into v_users from auth.users u where u.id not in (select user_id from public.admin_users);

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

  -- 2) Registros de acesso de quem não é admin.
  delete from public.access_logs a
   where a.user_id is null or a.user_id not in (select user_id from public.admin_users);

  -- 3) Perfis e logins de clientes e vendedores.
  delete from public.profiles p where p.id not in (select user_id from public.admin_users);
  delete from auth.users u where u.id not in (select user_id from public.admin_users);

  raise notice 'Pronto: % conta(s) apagada(s); % admin(s) mantido(s).', v_users, v_admins;
end $$;

commit;

-- Conferência: o que ficou.
select
  (select count(*) from auth.users) as logins_restantes,
  (select count(*) from public.admin_users) as admins,
  (select count(*) from public.profiles) as perfis_restantes,
  (select count(*) from public.products) as pecas,
  (select count(*) from public.orders) as pedidos,
  (select count(*) from public.storefront_categories) as categorias_mantidas;
