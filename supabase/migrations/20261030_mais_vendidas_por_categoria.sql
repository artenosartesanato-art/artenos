-- Carrossel do topo da página inicial: a peça mais vendida de cada categoria.
-- Mesma regra de get_storefront_best_seller (pedidos pagos; últimos 90 dias
-- primeiro, histórico inteiro como desempate; só peças ativas, de lojas
-- aprovadas e que ainda podem ser compradas). Categorias sem venda ficam de fora.
begin;

drop function if exists public.list_storefront_best_sellers_by_category(integer);
create function public.list_storefront_best_sellers_by_category(p_limit integer default 8)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, collection_id uuid, category_name text, shop_name text,
  shop_id uuid, availability text, rating_avg numeric, rating_count integer,
  units_sold bigint
)
language sql stable security definer set search_path = '' as $$
  with sales as (
    select i.product_id,
      coalesce(sum(i.quantity) filter (where o.created_at >= now() - interval '90 days'), 0) as recent,
      sum(i.quantity) as total
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.payment_status = 'paid' and i.product_id is not null
    group by i.product_id
  ),
  ranked as (
    select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock,
      pr.ready_to_ship, pr.featured, pr.created_at, pr.category_id, pr.collection_id,
      cat.name as category_name, art.store_name as shop_name, art.id as shop_id,
      pr.availability, pr.rating_avg, pr.rating_count, s.total as units_sold, s.recent,
      row_number() over (partition by pr.category_id
        order by s.recent desc, s.total desc, pr.created_at desc) as position
    from sales s
    join public.products pr on pr.id = s.product_id
    join public.profiles art on art.id = pr.artisan_id
    join public.storefront_categories cat on cat.id = pr.category_id and cat.active
    where pr.active and pr.availability <> 'sold_out'
      and art.account_type = 'artisan' and art.approval_status = 'active'
  )
  select id, name, description, price, image_url, stock, ready_to_ship, featured,
    created_at, category_id, collection_id, category_name, shop_name, shop_id,
    availability, rating_avg, rating_count, units_sold
  from ranked
  where position = 1
  order by recent desc, units_sold desc, created_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke all on function public.list_storefront_best_sellers_by_category(integer) from public;
grant execute on function public.list_storefront_best_sellers_by_category(integer) to anon, authenticated;

commit;
