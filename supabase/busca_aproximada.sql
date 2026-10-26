-- Execute no SQL Editor depois de vitrine_cliente.sql e do script de categorias.
-- Habilita busca tolerante a pequenos erros de digitação, sem inserir dados.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.browse_storefront_products(
  p_query text default null, p_category_id uuid default null,
  p_min_price numeric default null, p_max_price numeric default null,
  p_ready_only boolean default false, p_sort text default 'newest',
  p_limit integer default 12, p_offset integer default 0
)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, category_name text, shop_name text, total_count bigint
)
language sql stable security definer set search_path = '' as $$
  select product.id, product.name, product.description, product.price,
    product.image_url, product.stock, product.ready_to_ship, product.featured,
    product.created_at, product.category_id, category.name, artisan.store_name,
    count(*) over()
  from public.products product
  join public.profiles artisan on artisan.id = product.artisan_id
  left join public.storefront_categories category
    on category.id = product.category_id and category.active
  where product.active
    and artisan.account_type = 'artisan' and artisan.approval_status = 'active'
    and (product.category_id is null or category.id is not null)
    and (p_category_id is null or product.category_id = p_category_id)
    and (p_min_price is null or product.price >= greatest(p_min_price, 0))
    and (p_max_price is null or product.price <= p_max_price)
    and (not coalesce(p_ready_only, false) or (product.ready_to_ship and product.stock > 0))
    and (nullif(trim(p_query), '') is null
      or product.name ilike '%' || trim(p_query) || '%'
      or coalesce(product.description, '') ilike '%' || trim(p_query) || '%'
      or coalesce(category.name, '') ilike '%' || trim(p_query) || '%'
      or coalesce(artisan.store_name, '') ilike '%' || trim(p_query) || '%'
      or extensions.similarity(lower(product.name), lower(trim(p_query))) >= 0.20
      or extensions.similarity(lower(coalesce(category.name, '')), lower(trim(p_query))) >= 0.28)
  order by
    case when nullif(trim(p_query), '') is not null then
      greatest(extensions.similarity(lower(product.name), lower(trim(p_query))),
        extensions.similarity(lower(coalesce(category.name, '')), lower(trim(p_query))))
    end desc,
    case when p_sort = 'price_asc' then product.price end asc,
    case when p_sort = 'price_desc' then product.price end desc,
    product.created_at desc, product.id
  limit least(greatest(coalesce(p_limit, 12), 1), 24)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

revoke all on function public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer) from public;
grant execute on function public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer) to anon, authenticated;
