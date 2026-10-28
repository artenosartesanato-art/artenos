-- Limpeza completa dos DADOS da plataforma, mantendo as contas.
-- Execute no SQL Editor do Supabase. FAÇA UM BACKUP ANTES
-- (Database → Backups, ou pg_dump): não há como desfazer.
--
-- MANTÉM:
--   * login (schema auth: usuários, senhas, sessões);
--   * public.profiles (dados de cadastro de clientes e artesãs);
--   * public.admin_users (quem administra a plataforma);
--   * public.artisan_applications (pedido de cadastro das artesãs, ligado à
--     aprovação da conta);
--   * por padrão, a CONFIGURAÇÃO da plataforma: categorias, coleções,
--     banners e taxas (troque manter_configuracao para false para apagar).
--
-- APAGA (todas as outras tabelas do schema public, inclusive as que existirem
-- só em produção): peças, carrinhos, favoritos, pedidos, pagamentos/checkouts,
-- repasses, frete, encomendas, mensagens, conversas, notificações,
-- configurações das lojas, contas de repasse, cálculos de precificação e
-- registros de auditoria.
--
-- Segurança:
--   * tudo numa transação: se algo falhar, nada é apagado;
--   * TRUNCATE sem CASCADE: se uma tabela mantida depender de uma tabela
--     apagada, o banco recusa em vez de apagar a tabela mantida;
--   * tabelas que pertencem a extensões não são tocadas.
--
-- Fotos: os arquivos das peças e capas de loja ficam no Storage
-- (bucket artenos-store-assets). O Supabase não permite apagar arquivos por
-- SQL; esvazie o bucket em Storage → artenos-store-assets se quiser. As fotos
-- de perfil (artenos-profile-avatars) são mantidas.
begin;

do $$
declare
  manter_configuracao constant boolean := true;  -- false: apaga categorias, coleções, banners e taxas
  manter text[] := array['profiles', 'admin_users', 'artisan_applications'];
  configuracao text[] := array[
    'storefront_categories', 'storefront_collections', 'storefront_banners', 'platform_pricing_settings'
  ];
  alvo text;
begin
  if manter_configuracao then
    manter := manter || configuracao;
  end if;

  select string_agg(format('public.%I', c.relname), ', ' order by c.relname)
    into alvo
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname <> all (manter)
    -- não mexe em tabelas criadas por extensões
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');

  if alvo is null then
    raise notice 'Nada para limpar.';
    return;
  end if;

  raise notice 'Limpando: %', alvo;
  execute 'truncate table ' || alvo || ' restart identity';
end $$;

commit;

-- Conferência: linhas restantes por tabela (as mantidas continuam com dados).
select c.relname as tabela,
       (xpath('/row/total/text()', query_to_xml(format('select count(*) as total from public.%I', c.relname), false, true, '')))[1]::text::bigint as linhas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by linhas desc, tabela;
