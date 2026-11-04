-- Peça mais vendida da vitrine (destaque do topo da página inicial).
-- Conta as unidades de pedidos pagos: primeiro os últimos 90 dias, depois o
-- histórico inteiro como desempate. Só peças ativas, de lojas aprovadas e
-- que ainda podem ser compradas. Sem nenhuma venda, não devolve nada.
begin;

drop function if exists public.get_storefront_best_seller();
create function public.get_storefront_best_seller()
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
      sum(i.quantity) filter (where o.created_at >= now() - interval '90 days') as recent,
      sum(i.quantity) as total
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.payment_status = 'paid' and i.product_id is not null
    group by i.product_id
  )
  select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock,
    pr.ready_to_ship, pr.featured, pr.created_at, pr.category_id, pr.collection_id,
    cat.name, art.store_name, art.id, pr.availability, pr.rating_avg, pr.rating_count,
    s.total
  from sales s
  join public.products pr on pr.id = s.product_id
  join public.profiles art on art.id = pr.artisan_id
  left join public.storefront_categories cat on cat.id = pr.category_id
  where pr.active and pr.availability <> 'sold_out'
    and art.account_type = 'artisan' and art.approval_status = 'active'
  order by coalesce(s.recent, 0) desc, s.total desc, pr.created_at desc
  limit 1;
$$;
revoke all on function public.get_storefront_best_seller() from public;
grant execute on function public.get_storefront_best_seller() to anon, authenticated;

commit;
