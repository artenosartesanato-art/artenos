-- Artenós: contexto visual para vitrine e carrinho (redesenho de UX/UI).
-- Execute UMA vez no SQL Editor, depois de vitrine_cliente.sql,
-- corrigir_favoritos_estoque_carrinho.sql e busca_aproximada.sql.
--
-- O que muda: as funções passam a devolver colunas ADICIONAIS e públicas:
--   * list_cart: image_url e artisan_id (foto da peça e agrupamento por loja);
--   * search_storefront_products e browse_storefront_products: shop_id
--     (link "Conhecer a loja" no detalhe da peça).
-- O que NÃO muda: filtros, regras de aprovação, estoque, preços, permissões
-- e dados. Nenhum dado pessoal novo é exposto (artisan_id já é público em
-- /loja?id=...). O front-end funciona com ou sem esta migração.

begin;

drop function if exists public.list_cart();
create function public.list_cart()
returns table (
  item_id uuid, product_id uuid, product_name text, store_name text,
  unit_price numeric, quantity integer, stock integer,
  product_active boolean, added_at timestamptz,
  image_url text, artisan_id uuid
)
language sql stable security definer set search_path = '' as $$
  select item.id, item.product_id, product.name,
         coalesce(profile.store_name, profile.full_name), item.unit_price,
         item.quantity, product.stock,
         product.active and public.is_public_artisan(product.artisan_id),
         item.created_at, product.image_url, item.artisan_id
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles profile on profile.id = item.artisan_id
  where item.client_id = auth.uid()
  order by item.created_at desc;
$$;
revoke all on function public.list_cart() from public, anon;
grant execute on function public.list_cart() to authenticated;

drop function if exists public.search_storefront_products(text, uuid, uuid, text, integer);
create function public.search_storefront_products(
  p_query text default null,
  p_category_id uuid default null,
  p_collection_id uuid default null,
  p_section text default 'all',
  p_limit integer default 12
)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, collection_id uuid, category_name text, shop_name text,
  shop_id uuid
)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock,
    pr.ready_to_ship, pr.featured, pr.created_at, pr.category_id, pr.collection_id,
    cat.name as category_name, art.store_name as shop_name, art.id as shop_id
  from public.products pr
  join public.profiles art on art.id = pr.artisan_id
  left join public.storefront_categories cat on cat.id = pr.category_id
  where pr.active and art.account_type = 'artisan' and art.approval_status = 'active'
    and (p_category_id is null or pr.category_id = p_category_id)
    and (p_collection_id is null or pr.collection_id = p_collection_id)
    and (p_section <> 'featured' or pr.featured)
    and (p_section <> 'ready' or (pr.ready_to_ship and pr.stock > 0))
    and (nullif(trim(p_query), '') is null or
      pr.name ilike '%' || trim(p_query) || '%' or
      coalesce(pr.description, '') ilike '%' || trim(p_query) || '%' or
      coalesce(cat.name, '') ilike '%' || trim(p_query) || '%' or
      coalesce(art.store_name, '') ilike '%' || trim(p_query) || '%')
  order by case when p_section = 'featured' then pr.featured end desc, pr.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 40);
$$;
revoke all on function public.search_storefront_products(text, uuid, uuid, text, integer) from public;
grant execute on function public.search_storefront_products(text, uuid, uuid, text, integer) to anon, authenticated;

drop function if exists public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer);
create function public.browse_storefront_products(
  p_query text default null, p_category_id uuid default null,
  p_min_price numeric default null, p_max_price numeric default null,
  p_ready_only boolean default false, p_sort text default 'newest',
  p_limit integer default 12, p_offset integer default 0
)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, category_name text, shop_name text, total_count bigint,
  shop_id uuid
)
language sql stable security definer set search_path = '' as $$
  select product.id, product.name, product.description, product.price,
    product.image_url, product.stock, product.ready_to_ship, product.featured,
    product.created_at, product.category_id, category.name, artisan.store_name,
    count(*) over(), artisan.id
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

commit;
