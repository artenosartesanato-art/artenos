-- Artenós: status de produção dos itens sob encomenda (no card, em Pedidos e
-- em Vendas) e orçamentos sob encomenda dentro da página da loja.
-- Execute UMA vez depois de 20261029_avaliacoes.sql. Pode ser repetido.
--
-- Status exibido para um item sob encomenda:
--   Aguardando confirmação da loja → Em produção → Pronto para envio  (item, a loja muda)
--   → Enviado → Entregue (ou Cancelado)                                 (vêm do status do pedido)
-- Cada mudança feita pela loja avisa quem comprou (sininho).

begin;

alter table public.order_items
  add column if not exists production_status text,
  add column if not exists production_updated_at timestamptz;
alter table public.order_items drop constraint if exists order_items_production_status_check;
alter table public.order_items add constraint order_items_production_status_check
  check (production_status is null or production_status in ('awaiting_confirmation', 'in_production', 'ready_to_ship'));

update public.order_items set production_status = 'awaiting_confirmation', production_updated_at = now()
  where made_to_order and production_status is null;

create or replace function public.start_item_production_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.made_to_order and new.production_status is null then
    new.production_status := 'awaiting_confirmation';
    new.production_updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists start_item_production_status on public.order_items;
create trigger start_item_production_status before insert on public.order_items
  for each row execute function public.start_item_production_status();

create or replace function public.update_order_item_production(p_item_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.order_items; v_order public.orders;
  v_rank constant jsonb := '{"awaiting_confirmation": 1, "in_production": 2, "ready_to_ship": 3}';
  v_label text;
begin
  if p_status not in ('awaiting_confirmation', 'in_production', 'ready_to_ship') then raise exception 'Status inválido'; end if;
  select * into v_item from public.order_items where id = p_item_id for update;
  if not found then raise exception 'Item não encontrado'; end if;
  select * into v_order from public.orders where id = v_item.order_id;
  if v_order.artisan_id is distinct from auth.uid() then raise exception 'Item não encontrado'; end if;
  if not v_item.made_to_order then raise exception 'Somente itens sob encomenda têm status de produção'; end if;
  if v_order.status in ('shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded') then
    raise exception 'O pedido já saiu da produção';
  end if;
  if (v_rank->>p_status)::integer < (v_rank->>coalesce(v_item.production_status, 'awaiting_confirmation'))::integer - 1 then
    raise exception 'Volte no máximo uma etapa';
  end if;
  update public.order_items set production_status = p_status, production_updated_at = now() where id = p_item_id;
  v_label := case p_status when 'awaiting_confirmation' then 'Aguardando confirmação da loja'
    when 'in_production' then 'Em produção' else 'Pronto para envio' end;
  perform public.push_notification(v_order.client_id, 'pedido', v_item.product_name || ': ' || v_label,
    'A loja atualizou a produção da sua encomenda.', '/pedidos', v_order.id);
end $$;
revoke all on function public.update_order_item_production(uuid, text) from public, anon;
grant execute on function public.update_order_item_production(uuid, text) to authenticated;

drop function if exists public.list_order_item_details(uuid[]);
create function public.list_order_item_details(p_order_ids uuid[])
returns table (
  order_id uuid, item_id uuid, product_id uuid, product_name text, quantity integer,
  made_to_order boolean, customer_notes text, product_summary text,
  production_status text, production_updated_at timestamptz, order_status text
)
language sql stable security definer set search_path = '' as $$
  select i.order_id, i.id, i.product_id, i.product_name, i.quantity,
    i.made_to_order, i.customer_notes, i.product_summary,
    i.production_status, i.production_updated_at, o.status
  from public.order_items i join public.orders o on o.id = i.order_id
  where i.order_id = any(p_order_ids[1:200]) and auth.uid() in (o.client_id, o.artisan_id)
  order by i.order_id, i.product_name;
$$;
revoke all on function public.list_order_item_details(uuid[]) from public, anon;
grant execute on function public.list_order_item_details(uuid[]) to authenticated;

-- Encomendas em andamento de quem está logado (selo no card da vitrine).
create or replace function public.list_my_open_custom_orders()
returns table (product_id uuid, order_id uuid, production_status text, order_status text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (i.product_id) i.product_id, o.id, i.production_status, o.status,
    greatest(coalesce(i.production_updated_at, o.created_at), o.updated_at)
  from public.order_items i join public.orders o on o.id = i.order_id
  where o.client_id = auth.uid() and i.made_to_order and i.product_id is not null
    and o.status not in ('delivered', 'cancelled', 'refunded')
  order by i.product_id, o.created_at desc;
$$;
revoke all on function public.list_my_open_custom_orders() from public, anon;
grant execute on function public.list_my_open_custom_orders() to authenticated;

-- Opções de orçamento de uma loja (antes só na tela separada /sob-encomenda).
create or replace function public.list_store_custom_order_services(p_artisan_id uuid)
returns table (id uuid, artisan_id uuid, title text, description text, image_url text, starting_price numeric,
  min_production_days integer, max_production_days integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.artisan_id, s.title, s.description, s.image_url, s.starting_price,
    s.min_production_days, s.max_production_days
  from public.custom_order_services s
  left join public.artisan_store_settings st on st.artisan_id = s.artisan_id
  where s.artisan_id = p_artisan_id and s.active and public.is_public_artisan(s.artisan_id)
    and coalesce(st.accepts_custom_orders, true) and not coalesce(st.vacation_mode, false)
  order by s.created_at desc
  limit 24;
$$;
revoke all on function public.list_store_custom_order_services(uuid) from public;
grant execute on function public.list_store_custom_order_services(uuid) to anon, authenticated;

-- Vitrine: filtro "Só sob encomenda" (p_availability), que substitui a tela separada.
drop function if exists public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer);
drop function if exists public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer, text);
create function public.browse_storefront_products(
  p_query text default null, p_category_id uuid default null,
  p_min_price numeric default null, p_max_price numeric default null,
  p_ready_only boolean default false, p_sort text default 'newest',
  p_limit integer default 12, p_offset integer default 0,
  p_availability text default null
)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, category_name text, shop_name text, total_count bigint,
  shop_id uuid, availability text, rating_avg numeric, rating_count integer
)
language sql stable security definer set search_path = '' as $$
  select product.id, product.name, product.description, product.price,
    product.image_url, product.stock, product.ready_to_ship, product.featured,
    product.created_at, product.category_id, category.name, artisan.store_name,
    count(*) over(), artisan.id, product.availability, product.rating_avg, product.rating_count
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
    and (not coalesce(p_ready_only, false) or product.availability = 'ready')
    and (p_availability is null or product.availability = p_availability)
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
    case when p_sort = 'rating' then coalesce(product.rating_avg, 0) end desc,
    case when p_sort = 'rating' then product.rating_count end desc,
    case when p_sort = 'price_asc' then product.price end asc,
    case when p_sort = 'price_desc' then product.price end desc,
    product.created_at desc, product.id
  limit least(greatest(coalesce(p_limit, 12), 1), 24)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;
revoke all on function public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer, text) from public;
grant execute on function public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer, text) to anon, authenticated;

commit;
