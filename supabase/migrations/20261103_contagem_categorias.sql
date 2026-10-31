-- Contador das categorias (menu "Categorias", home e listagem): passa a somar
-- as peças E as opções sob encomenda de cada categoria. Antes só as peças
-- entravam, e uma categoria com apenas uma opção sob encomenda aparecia com 0.
-- Mesmas regras de visibilidade da vitrine:
--   peças:  publicadas, de loja pública (browse_storefront_products);
--   opções: ativas, de loja pública que aceita encomendas e não está em férias
--           (list_public_custom_order_services).
-- Função nova (a antiga, list_storefront_categories_with_products, continua
-- existindo e o site só a usa como reserva).
begin;

drop function if exists public.list_storefront_categories_with_counts();
create function public.list_storefront_categories_with_counts()
returns table (id uuid, name text, slug text, image_url text,
  product_count bigint, piece_count bigint, service_count bigint)
language sql stable security definer set search_path = '' as $$
  with pieces as (
    select p.category_id, count(*) as total
    from public.products p
    where p.active and public.is_public_artisan(p.artisan_id) and p.category_id is not null
    group by p.category_id
  ), services as (
    select s.category_id, count(*) as total
    from public.custom_order_services s
    left join public.artisan_store_settings st on st.artisan_id = s.artisan_id
    where s.active and public.is_public_artisan(s.artisan_id) and s.category_id is not null
      and coalesce(st.accepts_custom_orders, true) and not coalesce(st.vacation_mode, false)
    group by s.category_id
  )
  select c.id, c.name, c.slug, c.image_url,
    coalesce(pc.total, 0) + coalesce(sc.total, 0), coalesce(pc.total, 0), coalesce(sc.total, 0)
  from public.storefront_categories c
  left join pieces pc on pc.category_id = c.id
  left join services sc on sc.category_id = c.id
  where c.active
  order by c.sort_order, c.name;
$$;
revoke all on function public.list_storefront_categories_with_counts() from public;
grant execute on function public.list_storefront_categories_with_counts() to anon, authenticated;

commit;
