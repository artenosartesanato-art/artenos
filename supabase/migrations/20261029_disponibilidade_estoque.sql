-- Artenós: pronta entrega × sob encomenda calculados a partir do estoque.
-- Execute UMA vez no SQL Editor, depois de integracao_pagamento_frete_estoque.sql
-- e de migrations/20261028_vitrine_carrinho_contexto.sql. Pode ser repetido.
--
-- Regra única (public.compute_product_availability):
--   estoque > 0                          → 'ready'          (Pronta entrega)
--   estoque 0/vazio e loja aceita encomenda → 'made_to_order' (Sob encomenda)
--   estoque 0/vazio e loja não aceita    → 'sold_out'       (Esgotado)
-- products.availability e products.ready_to_ship passam a ser derivados por
-- trigger: o que a loja enviar em ready_to_ship é ignorado. "Estoque vazio"
-- vira 0 (antes, vazio significava "sem limite").
--
-- Compra: unidades a pronta entrega continuam reservadas de forma atômica ao
-- abrir o checkout (linha bloqueada com FOR UPDATE) e devolvidas se a compra
-- for cancelada/expirar. Itens sob encomenda não consomem estoque e ficam
-- marcados em checkout_items/order_items.made_to_order.

begin;

do $$
begin
  if to_regclass('public.artisan_store_settings') is null or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'artisan_store_settings'
      and column_name = 'accepts_custom_orders') then
    raise exception 'Tabela public.artisan_store_settings(accepts_custom_orders) não encontrada. Envie o resultado de \d public.artisan_store_settings antes de continuar.';
  end if;
end $$;

alter table public.products
  add column if not exists availability text not null default 'made_to_order';
alter table public.products drop constraint if exists products_availability_check;
alter table public.products add constraint products_availability_check
  check (availability in ('ready', 'made_to_order', 'sold_out'));
alter table public.checkout_items
  add column if not exists made_to_order boolean not null default false;
alter table public.order_items
  add column if not exists made_to_order boolean not null default false;

create or replace function public.compute_product_availability(p_stock integer, p_artisan_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(p_stock, 0) > 0 then 'ready'
    when coalesce((select s.accepts_custom_orders from public.artisan_store_settings s
                   where s.artisan_id = p_artisan_id), true) then 'made_to_order'
    else 'sold_out'
  end;
$$;
revoke all on function public.compute_product_availability(integer, uuid) from public, anon, authenticated;

create or replace function public.derive_product_availability()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.stock := greatest(coalesce(new.stock, 0), 0);
  new.ready_to_ship := new.stock > 0;
  new.availability := public.compute_product_availability(new.stock, new.artisan_id);
  return new;
end $$;

drop trigger if exists derive_product_availability on public.products;
create trigger derive_product_availability before insert or update on public.products
  for each row execute function public.derive_product_availability();

-- Loja passa a aceitar (ou deixa de aceitar) encomendas: recalcula as peças sem estoque.
create or replace function public.refresh_store_products_availability()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.accepts_custom_orders is distinct from old.accepts_custom_orders then
    update public.products set updated_at = updated_at
      where artisan_id = new.artisan_id and stock = 0;
  end if;
  return null;
end $$;

drop trigger if exists refresh_store_products_availability on public.artisan_store_settings;
create trigger refresh_store_products_availability
  after insert or update on public.artisan_store_settings
  for each row execute function public.refresh_store_products_availability();

-- Recalcula tudo (o trigger preenche stock/ready_to_ship/availability).
update public.products set updated_at = updated_at;

-- Uma peça pode entrar no carrinho? Devolve a quantidade máxima permitida.
create or replace function public.product_max_quantity(p_product public.products)
returns integer language sql stable set search_path = '' as $$
  select case p_product.availability
    when 'ready' then least(p_product.stock, 99)
    when 'made_to_order' then 99
    else 0 end;
$$;

create or replace function public.add_to_cart(p_product_id uuid, p_quantity integer default 1)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_max integer;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para usar o carrinho'; end if;
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;

  select product.* into v_product from public.products product
  where product.id = p_product_id and product.active
    and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Produto não encontrado ou indisponível'; end if;
  v_max := public.product_max_quantity(v_product);
  if v_max = 0 then raise exception 'Peça esgotada no momento.'; end if;
  if p_quantity > v_max then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) a pronta entrega.', v_max;
  end if;

  insert into public.cart_items as item
    (client_id, product_id, artisan_id, unit_price, quantity)
  values (auth.uid(), v_product.id, v_product.artisan_id, v_product.price, p_quantity)
  on conflict (client_id, product_id) do update
    set quantity = item.quantity + excluded.quantity,
        unit_price = excluded.unit_price,
        updated_at = now()
    where item.quantity + excluded.quantity <= v_max
  returning item.id into v_id;

  if v_id is null then
    raise exception 'Estoque insuficiente. Você já possui a quantidade máxima disponível no carrinho.';
  end if;
  return v_id;
end;
$$;

create or replace function public.set_cart_quantity(p_item_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_max integer;
begin
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;
  select product.* into v_product
  from public.cart_items item
  join public.products product on product.id = item.product_id
  where item.id = p_item_id and item.client_id = auth.uid() and product.active
    and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Item não encontrado ou produto indisponível'; end if;
  v_max := public.product_max_quantity(v_product);
  if v_max = 0 then raise exception 'Peça esgotada no momento.'; end if;
  if p_quantity > v_max then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) a pronta entrega.', v_max;
  end if;
  update public.cart_items set quantity = p_quantity, updated_at = now()
  where id = p_item_id and client_id = auth.uid();
end;
$$;

drop function if exists public.list_cart();
create function public.list_cart()
returns table (
  item_id uuid, product_id uuid, product_name text, store_name text,
  unit_price numeric, quantity integer, stock integer,
  product_active boolean, added_at timestamptz,
  image_url text, artisan_id uuid, availability text, max_quantity integer
)
language sql stable security definer set search_path = '' as $$
  select item.id, item.product_id, product.name,
         coalesce(profile.store_name, profile.full_name), item.unit_price,
         item.quantity, product.stock,
         product.active and public.is_public_artisan(product.artisan_id),
         item.created_at, product.image_url, item.artisan_id,
         product.availability, public.product_max_quantity(product)
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles profile on profile.id = item.artisan_id
  where item.client_id = auth.uid()
  order by item.created_at desc;
$$;
revoke all on function public.list_cart() from public, anon;
grant execute on function public.list_cart() to authenticated;

-- Para listas que vêm de funções sem a coluna availability (loja pública, favoritos).
drop function if exists public.get_products_availability(uuid[]);
create function public.get_products_availability(p_ids uuid[])
returns table (id uuid, availability text, stock integer, max_quantity integer)
language sql stable security definer set search_path = '' as $$
  select product.id, product.availability, product.stock, public.product_max_quantity(product)
  from public.products product
  where product.id = any(p_ids[1:200]) and product.active
    and public.is_public_artisan(product.artisan_id);
$$;
revoke all on function public.get_products_availability(uuid[]) from public;
grant execute on function public.get_products_availability(uuid[]) to anon, authenticated;

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
  shop_id uuid, availability text
)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock,
    pr.ready_to_ship, pr.featured, pr.created_at, pr.category_id, pr.collection_id,
    cat.name as category_name, art.store_name as shop_name, art.id as shop_id,
    pr.availability
  from public.products pr
  join public.profiles art on art.id = pr.artisan_id
  left join public.storefront_categories cat on cat.id = pr.category_id
  where pr.active and art.account_type = 'artisan' and art.approval_status = 'active'
    and (p_category_id is null or pr.category_id = p_category_id)
    and (p_collection_id is null or pr.collection_id = p_collection_id)
    and (p_section <> 'featured' or pr.featured)
    and (p_section <> 'ready' or pr.availability = 'ready')
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
drop function if exists public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer, text);
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
  shop_id uuid, availability text
)
language sql stable security definer set search_path = '' as $$
  select product.id, product.name, product.description, product.price,
    product.image_url, product.stock, product.ready_to_ship, product.featured,
    product.created_at, product.category_id, category.name, artisan.store_name,
    count(*) over(), artisan.id, product.availability
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

-- Checkout: mesma função de integracao_pagamento_frete_estoque.sql, agora
-- com a regra de disponibilidade (reserva só o que é pronta entrega).
create or replace function public.create_checkout_from_cart()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  buyer public.profiles; quote public.shipping_quotes;
  item record; seller record; checkout_id uuid; existing_id uuid;
  subtotal numeric(12,2):=0; shipping numeric(12,2):=0;
  fee numeric; snapshots jsonb:='[]'::jsonb; destination text;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  -- Serializa cliques/abas da mesma conta.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  perform public.release_unstarted_checkouts();
  select id into existing_id from public.checkouts
    where client_id=auth.uid() and status in ('pending','awaiting_payment')
    order by created_at desc limit 1 for update;
  if found then
    if exists(select 1 from public.checkouts where id=existing_id and integration_version=2)
      then return existing_id;
    end if;
    raise exception 'Há uma compra antiga em aberto. Concilie ou cancele antes de continuar';
  end if;
  select * into buyer from public.profiles
    where id=auth.uid() and approval_status='active';
  if not found then raise exception 'Comprador inválido ou inativo'; end if;
  destination:=regexp_replace(coalesce(buyer.cep,''),'\D','','g');
  if destination !~ '^[0-9]{8}$' or nullif(trim(buyer.address),'') is null
    or nullif(trim(buyer.address_number),'') is null
    or nullif(trim(buyer.city),'') is null or nullif(trim(buyer.state),'') is null then
    raise exception 'Complete seu endereço de entrega no perfil';
  end if;
  perform id from public.cart_items where client_id=auth.uid() order by id for update;
  if not found then raise exception 'Seu carrinho está vazio'; end if;
  perform p.id from public.products p join public.cart_items ci on ci.product_id=p.id
    where ci.client_id=auth.uid() order by p.id for update of p;
  select platform_fee_percent into fee from public.platform_pricing_settings where id=1;
  if fee is null or fee<0 or fee>=100 then raise exception 'Tarifa da plataforma inválida'; end if;
  for item in select ci.*, p.price, p.stock, p.active, p.name, p.availability,
      p.artisan_id as actual_artisan
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.client_id=auth.uid()
  loop
    if not item.active or not public.is_public_artisan(item.actual_artisan)
      or item.artisan_id<>item.actual_artisan or item.actual_artisan=auth.uid() then
      raise exception 'Produto indisponível ou pertence à sua loja: %',item.name;
    end if;
    if item.quantity<1 or item.quantity>99 then
      raise exception 'Quantidade inválida para %',item.name;
    end if;
    -- Pronta entrega: limitada ao estoque. Sob encomenda: não consome estoque.
    if item.availability='sold_out' then
      raise exception '% está esgotada',item.name;
    end if;
    if item.availability='ready' and item.quantity>item.stock then
      raise exception 'Estoque insuficiente para %: há % unidade(s) a pronta entrega',item.name,item.stock;
    end if;
    if item.unit_price<>item.price then
      raise exception 'O preço de % mudou. Atualize o carrinho e recalcule o frete',item.name;
    end if;
    subtotal:=subtotal+round(item.price*item.quantity,2);
  end loop;
  for seller in select distinct artisan_id from public.cart_items where client_id=auth.uid()
  loop
    select q.* into quote from public.cart_shipping_selections s
      join public.shipping_quotes q on q.id=s.quote_id
      where s.client_id=auth.uid() and s.artisan_id=seller.artisan_id
      and q.client_id=auth.uid() and q.artisan_id=seller.artisan_id
      and q.destination_cep=destination and q.expires_at>now()
      and q.cart_signature=public.current_cart_shipping_signature(auth.uid(),seller.artisan_id,destination);
    if not found then raise exception 'Selecione um frete válido para cada loja'; end if;
    shipping:=shipping+quote.price;
    snapshots:=snapshots||jsonb_build_array(to_jsonb(quote));
  end loop;
  insert into public.checkouts(client_id,total_amount,platform_fee_percent,
    integration_version,shipping_snapshot,buyer_snapshot,reservation_expires_at)
    values(auth.uid(),subtotal+shipping,fee,2,snapshots,
      jsonb_build_object('full_name',buyer.full_name,'cep',destination,
        'address',buyer.address,'address_number',buyer.address_number,
        'city',buyer.city,'state',upper(buyer.state)),now()+interval '30 minutes')
    returning id into checkout_id;
  insert into public.checkout_items(checkout_id,product_id,artisan_id,product_name,
    unit_price,quantity,line_total,image_url,stock_reserved,made_to_order)
    select checkout_id,p.id,p.artisan_id,p.name,p.price,ci.quantity,
      round(p.price*ci.quantity,2),p.image_url,
      p.availability='ready',p.availability<>'ready'
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.client_id=auth.uid();
  -- Baixa atômica: as linhas de products já estão bloqueadas (FOR UPDATE acima).
  update public.products p set stock=p.stock-ci.quantity,updated_at=now()
    from public.cart_items ci where ci.client_id=auth.uid() and ci.product_id=p.id
    and p.availability='ready';
  return checkout_id;
end $$;

-- Finalização: copia made_to_order para order_items (status de produção).
create or replace function public.finalize_checkout(
  p_checkout_id uuid,p_mp_payment_id text,p_payment_method text,
  p_gateway_fee numeric,p_fee_percent numeric,p_hold_days integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c public.checkouts; seller record; item record; q jsonb; v_order_id uuid;
  freight numeric; fee numeric; gateway numeric; fee_left numeric;
  remaining_total numeric; total numeric;
begin
  select * into c from public.checkouts where id=p_checkout_id for update;
  if not found then raise exception 'Compra não encontrada'; end if;
  if c.status='approved' and c.mp_payment_id=p_mp_payment_id then return false; end if;
  if c.status not in ('pending','awaiting_payment') or c.integration_version is distinct from 2 then
    raise exception 'Compra não conciliável automaticamente; verifique o pagamento';
  end if;
  if c.payment_started_at is null then raise exception 'Pagamento não iniciado pelo servidor'; end if;
  if c.mp_payment_id is not null and c.mp_payment_id<>p_mp_payment_id then
    raise exception 'Pagamento diferente do registrado';
  end if;
  if c.platform_fee_percent is null or c.shipping_snapshot is null or c.buyer_snapshot is null then
    raise exception 'Dados congelados da compra incompletos';
  end if;
  fee_left:=greatest(coalesce(p_gateway_fee,0),0); remaining_total:=c.total_amount;
  for seller in select artisan_id,sum(line_total) as subtotal
    from public.checkout_items where checkout_id=c.id group by artisan_id order by artisan_id
  loop
    select value into q from jsonb_array_elements(c.shipping_snapshot)
      where value->>'artisan_id'=seller.artisan_id::text;
    if q is null then raise exception 'Frete congelado não encontrado'; end if;
    freight:=(q->>'price')::numeric; total:=seller.subtotal+freight;
    fee:=round(seller.subtotal*c.platform_fee_percent/100,2);
    gateway:=case when abs(remaining_total-total)<0.01 then fee_left
      else least(fee_left,round(greatest(coalesce(p_gateway_fee,0),0)*total/c.total_amount,2)) end;
    remaining_total:=remaining_total-total; fee_left:=fee_left-gateway;
    insert into public.orders(checkout_id,client_id,artisan_id,product_name,status,
      payment_status,payment_reference,subtotal,shipping_amount,total_amount,
      platform_fee_percent,platform_fee_amount,artisan_net_amount,
      recipient_name,shipping_cep,shipping_address,shipping_number,shipping_city,shipping_state,
      carrier,estimated_delivery_date,shipping_provider,shipping_service_id,
      shipping_service_name,shipping_company,shipping_delivery_min_days,
      shipping_delivery_max_days,shipping_production_days,shipping_quote_id)
    values(c.id,c.client_id,seller.artisan_id,
      (select string_agg(product_name,', ') from public.checkout_items where checkout_id=c.id and artisan_id=seller.artisan_id),
      'payment_confirmed','paid',p_mp_payment_id,seller.subtotal,freight,total,
      c.platform_fee_percent,fee,greatest(total-fee-gateway,0),
      c.buyer_snapshot->>'full_name',c.buyer_snapshot->>'cep',c.buyer_snapshot->>'address',
      c.buyer_snapshot->>'address_number',c.buyer_snapshot->>'city',c.buyer_snapshot->>'state',
      (q->>'company_name')||' - '||(q->>'service_name'),
      current_date+(q->>'total_delivery_max_days')::integer,q->>'provider',
      (q->>'service_id')::integer,q->>'service_name',q->>'company_name',
      (q->>'carrier_delivery_min_days')::integer,(q->>'carrier_delivery_max_days')::integer,
      (q->>'production_time_days')::integer,
      (select id from public.shipping_quotes where id=(q->>'id')::uuid)) returning id into v_order_id;
    insert into public.order_items(order_id,product_id,product_name,image_url,quantity,unit_price,subtotal,made_to_order)
      select v_order_id,product_id,product_name,image_url,quantity,unit_price,line_total,made_to_order
      from public.checkout_items where checkout_id=c.id and artisan_id=seller.artisan_id;
    insert into public.order_status_history(order_id,status,description)
      values(v_order_id,'payment_confirmed','Pagamento confirmado pelo Mercado Pago; frete e estoque registrados.');
    insert into public.conversations(order_id,client_id,artisan_id)
      values(v_order_id,c.client_id,seller.artisan_id) on conflict(order_id) do nothing;
    insert into public.payouts(checkout_id,artisan_id,gross_amount,platform_fee,gateway_fee,net_amount,release_after)
      values(c.id,seller.artisan_id,total,fee,gateway,greatest(total-fee-gateway,0),
        now()+make_interval(days=>greatest(coalesce(p_hold_days,0),0)))
      on conflict(checkout_id,artisan_id) do nothing;
  end loop;
  update public.checkouts set status='approved',paid_at=now(),mp_payment_id=p_mp_payment_id,
    mp_status='approved',payment_method=p_payment_method,gateway_fee=p_gateway_fee,
    pix_qr_code=null,pix_qr_code_base64=null where id=c.id;
  -- Só remove itens não editados após abrir o pagamento; preserva novas compras.
  delete from public.cart_items cart using public.checkout_items paid
    where paid.checkout_id=c.id and cart.client_id=c.client_id
    and cart.product_id=paid.product_id and cart.quantity=paid.quantity
    and cart.updated_at<=c.created_at;
  delete from public.cart_shipping_selections s where s.client_id=c.client_id
    and exists (select 1 from public.checkout_items ci where ci.checkout_id=c.id and ci.artisan_id=s.artisan_id)
    and s.selected_at<=c.created_at;
  return true;
end $$;

commit;
