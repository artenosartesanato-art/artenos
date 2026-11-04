-- Artenós: "Comprar agora" — checkout de UMA peça, sem misturar com o carrinho.
-- Execute UMA vez depois de 20261029_descricao_observacoes.sql. Pode ser repetido.
-- Depois, publique de novo a Edge Function calculate-shipping (ela passa a
-- aceitar mode = 'buy_now'): supabase functions deploy calculate-shipping
--
-- Como funciona: start_buy_now guarda a peça e a quantidade em buy_now_intents
-- (uma por pessoa). O frete é cotado só para ela (get_cart_shipping_packages
-- com p_mode = 'buy_now') e create_checkout_from_item abre a compra com a
-- mesma reserva de estoque, tarifa e congelamento de frete do carrinho.
-- O carrinho não é alterado.

begin;

create table if not exists public.buy_now_intents (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(12,2) not null check (unit_price > 0),
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.buy_now_intents enable row level security;
revoke all on public.buy_now_intents from public, anon, authenticated;

alter table public.checkouts add column if not exists source text not null default 'cart';
alter table public.checkouts drop constraint if exists checkouts_source_check;
alter table public.checkouts add constraint checkouts_source_check check (source in ('cart', 'buy_now'));

create or replace function public.start_buy_now(p_product_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_product public.products; v_max integer;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;
  select product.* into v_product from public.products product
    where product.id = p_product_id and product.active and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Produto não encontrado ou indisponível'; end if;
  if v_product.artisan_id = auth.uid() then raise exception 'Produto indisponível ou pertence à sua loja'; end if;
  v_max := public.product_max_quantity(v_product);
  if v_max = 0 then raise exception 'Peça esgotada no momento.'; end if;
  if p_quantity > v_max then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) a pronta entrega.', v_max;
  end if;
  insert into public.buy_now_intents as intent (client_id, product_id, artisan_id, quantity, unit_price)
    values (auth.uid(), v_product.id, v_product.artisan_id, p_quantity, v_product.price)
    on conflict (client_id) do update set
      customer_notes = case when intent.product_id = excluded.product_id then intent.customer_notes end,
      product_id = excluded.product_id, artisan_id = excluded.artisan_id,
      quantity = excluded.quantity, unit_price = excluded.unit_price, updated_at = now();
end $$;
revoke all on function public.start_buy_now(uuid, integer) from public, anon;
grant execute on function public.start_buy_now(uuid, integer) to authenticated;

create or replace function public.set_buy_now_notes(p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_availability text;
begin
  select product.availability into v_availability
    from public.buy_now_intents intent join public.products product on product.id = intent.product_id
    where intent.client_id = auth.uid();
  if not found then raise exception 'Escolha a peça novamente'; end if;
  if v_availability <> 'made_to_order' and nullif(btrim(coalesce(p_notes, '')), '') is not null then
    raise exception 'Observações são aceitas apenas em peças sob encomenda';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then raise exception 'Use no máximo 500 caracteres nas observações'; end if;
  perform public.moderation_assert_clean(p_notes);
  update public.buy_now_intents set customer_notes = nullif(btrim(p_notes), ''), updated_at = now()
    where client_id = auth.uid();
end $$;
revoke all on function public.set_buy_now_notes(text) from public, anon;
grant execute on function public.set_buy_now_notes(text) to authenticated;

create or replace function public.get_buy_now()
returns table (
  product_id uuid, product_name text, image_url text, artisan_id uuid, store_name text,
  quantity integer, unit_price numeric, current_price numeric, availability text, max_quantity integer,
  product_summary text, customer_notes text, product_active boolean
) language sql stable security definer set search_path = '' as $$
  select product.id, product.name, product.image_url, intent.artisan_id,
    coalesce(artisan.store_name, artisan.full_name), intent.quantity, intent.unit_price, product.price,
    product.availability, public.product_max_quantity(product),
    public.text_summary(product.description, 200), intent.customer_notes,
    product.active and public.is_public_artisan(product.artisan_id)
  from public.buy_now_intents intent
  join public.products product on product.id = intent.product_id
  join public.profiles artisan on artisan.id = intent.artisan_id
  where intent.client_id = auth.uid();
$$;
revoke all on function public.get_buy_now() from public, anon;
grant execute on function public.get_buy_now() to authenticated;

create or replace function public.current_buy_now_signature(p_client_id uuid, p_artisan_id uuid, p_destination_cep text)
returns text language sql stable security definer set search_path = '' as $$
  select md5('buy_now:' || concat_ws(':', intent.product_id::text, intent.quantity::text, intent.unit_price::text,
      product.shipping_weight_grams::text, product.shipping_height_cm::text, product.shipping_width_cm::text,
      product.shipping_length_cm::text, product.shipping_package_count::text, product.production_time_days::text,
      product.updated_at::text)
    || ':' || coalesce(p_destination_cep, '') || ':' || coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')))
  from public.buy_now_intents intent
  join public.products product on product.id = intent.product_id
  join public.profiles artisan on artisan.id = intent.artisan_id
  left join public.artisan_store_settings setting on setting.artisan_id = intent.artisan_id
  where intent.client_id = p_client_id and intent.artisan_id = p_artisan_id;
$$;
revoke all on function public.current_buy_now_signature(uuid, uuid, text) from public, anon, authenticated;

-- Mesma função de integracao_frete.sql, agora com p_mode ('cart' | 'buy_now').
drop function if exists public.get_cart_shipping_packages(text);
create or replace function public.get_cart_shipping_packages(p_destination_cep text, p_mode text default 'cart')
returns table (
  artisan_id uuid, store_name text, origin_cep text, destination_cep text, cart_signature text,
  product_id uuid, product_name text, unit_price numeric, quantity integer, weight_grams integer,
  height_cm numeric, width_cm numeric, length_cm numeric, package_count integer, production_time_days integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  normalized_destination text := regexp_replace(coalesce(p_destination_cep, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Faça login para calcular o frete'; end if;
  if normalized_destination !~ '^[0-9]{8}$' then
    raise exception 'Informe um CEP de destino com 8 números';
  end if;

  if p_mode = 'buy_now' then
    return query
    select intent.artisan_id, coalesce(artisan.store_name, artisan.full_name),
      coalesce(nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''), regexp_replace(artisan.cep, '\D', '', 'g')),
      normalized_destination,
      public.current_buy_now_signature(auth.uid(), intent.artisan_id, normalized_destination),
      product.id, product.name, intent.unit_price, intent.quantity,
      product.shipping_weight_grams, product.shipping_height_cm, product.shipping_width_cm,
      product.shipping_length_cm, product.shipping_package_count,
      coalesce(product.production_time_days, case when product.ready_to_ship then 0 else setting.production_time_days end)
    from public.buy_now_intents intent
    join public.products product on product.id = intent.product_id
    join public.profiles artisan on artisan.id = intent.artisan_id
    left join public.artisan_store_settings setting on setting.artisan_id = intent.artisan_id
    where intent.client_id = auth.uid() and product.active
      and artisan.account_type = 'artisan'::public.account_type
      and artisan.approval_status = 'active'::public.approval_status;
    return;
  end if;

  return query
  select item.artisan_id, coalesce(artisan.store_name, artisan.full_name),
    coalesce(nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''), regexp_replace(artisan.cep, '\D', '', 'g')),
    normalized_destination,
    public.current_cart_shipping_signature(auth.uid(), item.artisan_id, normalized_destination),
    product.id, product.name, item.unit_price, item.quantity,
    product.shipping_weight_grams, product.shipping_height_cm, product.shipping_width_cm,
    product.shipping_length_cm, product.shipping_package_count,
    coalesce(product.production_time_days, case when product.ready_to_ship then 0 else setting.production_time_days end)
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles artisan on artisan.id = item.artisan_id
  left join public.artisan_store_settings setting on setting.artisan_id = item.artisan_id
  where item.client_id = auth.uid() and product.active
    and artisan.account_type = 'artisan'::public.account_type
    and artisan.approval_status = 'active'::public.approval_status
  order by item.artisan_id, item.created_at, item.id;
end;
$$;
revoke all on function public.get_cart_shipping_packages(text, text) from public, anon;
grant execute on function public.get_cart_shipping_packages(text, text) to authenticated;

-- Compra aberta e ainda sem pagamento iniciado: libera para abrir outra.
create or replace function public.release_open_checkout_for_new_purchase()
returns void language plpgsql security definer set search_path = '' as $$
declare v_open public.checkouts;
begin
  select * into v_open from public.checkouts
    where client_id = auth.uid() and status in ('pending', 'awaiting_payment')
    order by created_at desc limit 1 for update;
  if not found then return; end if;
  if v_open.payment_started_at is not null or v_open.integration_version is distinct from 2 then
    raise exception 'Você tem um pagamento em andamento. Conclua ou cancele essa compra antes de abrir outra';
  end if;
  perform public.cancel_reserved_checkout(v_open.id, false);
end $$;
revoke all on function public.release_open_checkout_for_new_purchase() from public, anon, authenticated;

create or replace function public.create_checkout_from_item(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  buyer public.profiles; quote public.shipping_quotes; intent public.buy_now_intents;
  v_product public.products; v_checkout_id uuid; fee numeric; destination text; subtotal numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  perform public.release_unstarted_checkouts();
  perform public.release_open_checkout_for_new_purchase();

  select * into buyer from public.profiles where id = auth.uid() and approval_status = 'active';
  if not found then raise exception 'Comprador inválido ou inativo'; end if;
  destination := regexp_replace(coalesce(buyer.cep, ''), '\D', '', 'g');
  if destination !~ '^[0-9]{8}$' or nullif(trim(buyer.address), '') is null
    or nullif(trim(buyer.address_number), '') is null
    or nullif(trim(buyer.city), '') is null or nullif(trim(buyer.state), '') is null then
    raise exception 'Complete seu endereço de entrega no perfil';
  end if;

  select * into intent from public.buy_now_intents where client_id = auth.uid() for update;
  if not found then raise exception 'Escolha a peça novamente'; end if;
  select * into v_product from public.products where id = intent.product_id for update;
  if not found or not v_product.active or not public.is_public_artisan(v_product.artisan_id)
    or v_product.artisan_id <> intent.artisan_id or v_product.artisan_id = auth.uid() then
    raise exception 'Produto indisponível ou pertence à sua loja: %', coalesce(v_product.name, 'peça');
  end if;
  if v_product.availability = 'sold_out' then raise exception '% está esgotada', v_product.name; end if;
  if v_product.availability = 'ready' and intent.quantity > v_product.stock then
    raise exception 'Estoque insuficiente para %: há % unidade(s) a pronta entrega', v_product.name, v_product.stock;
  end if;
  if intent.unit_price <> v_product.price then
    raise exception 'O preço de % mudou. Escolha a peça novamente', v_product.name;
  end if;

  select q.* into quote from public.shipping_quotes q
    where q.id = p_quote_id and q.client_id = auth.uid() and q.artisan_id = intent.artisan_id
      and q.destination_cep = destination and q.expires_at > now()
      and q.cart_signature = public.current_buy_now_signature(auth.uid(), intent.artisan_id, destination);
  if not found then raise exception 'Selecione um frete válido'; end if;

  select platform_fee_percent into fee from public.platform_pricing_settings where id = 1;
  if fee is null or fee < 0 or fee >= 100 then raise exception 'Tarifa da plataforma inválida'; end if;
  subtotal := round(v_product.price * intent.quantity, 2);

  insert into public.checkouts(client_id, total_amount, platform_fee_percent, integration_version,
    shipping_snapshot, buyer_snapshot, reservation_expires_at, source)
  values (auth.uid(), subtotal + quote.price, fee, 2, jsonb_build_array(to_jsonb(quote)),
    jsonb_build_object('full_name', buyer.full_name, 'cep', destination, 'address', buyer.address,
      'address_number', buyer.address_number, 'city', buyer.city, 'state', upper(buyer.state)),
    now() + interval '30 minutes', 'buy_now')
  returning id into v_checkout_id;

  insert into public.checkout_items(checkout_id, product_id, artisan_id, product_name, unit_price, quantity,
    line_total, image_url, stock_reserved, made_to_order)
  values (v_checkout_id, v_product.id, v_product.artisan_id, v_product.name, v_product.price, intent.quantity,
    subtotal, v_product.image_url, v_product.availability = 'ready', v_product.availability <> 'ready');

  if v_product.availability = 'ready' then
    update public.products set stock = stock - intent.quantity, updated_at = now() where id = v_product.id;
  end if;
  return v_checkout_id;
end $$;
revoke all on function public.create_checkout_from_item(uuid) from public, anon;
grant execute on function public.create_checkout_from_item(uuid) to authenticated;

-- Observações: na compra direta vêm da intenção, não do carrinho.
create or replace function public.fill_checkout_item_context()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_source text; v_client uuid;
begin
  select c.source, c.client_id into v_source, v_client from public.checkouts c where c.id = new.checkout_id;
  if v_source = 'buy_now' then
    select case when new.made_to_order then intent.customer_notes end into new.customer_notes
      from public.buy_now_intents intent where intent.client_id = v_client and intent.product_id = new.product_id;
  else
    select case when new.made_to_order then item.customer_notes end into new.customer_notes
      from public.cart_items item where item.client_id = v_client and item.product_id = new.product_id;
  end if;
  select public.text_summary(product.description, 280) into new.product_summary
    from public.products product where product.id = new.product_id;
  return new;
end $$;

-- Carrinho: mesma função de 20261029_disponibilidade_estoque.sql; uma compra
-- direta ainda não paga é cancelada para o carrinho seguir.
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
  -- Uma compra direta ("Comprar agora") ainda sem pagamento dá lugar ao carrinho.
  perform public.cancel_reserved_checkout(id,false) from public.checkouts
    where client_id=auth.uid() and status in ('pending','awaiting_payment')
      and source='buy_now' and payment_started_at is null and integration_version=2;
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

-- Finalização: compra direta não apaga itens do carrinho.
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
  if c.source='buy_now' then
    -- Compra direta: o carrinho fica como estava.
    delete from public.buy_now_intents where client_id=c.client_id;
  else
    -- Só remove itens não editados após abrir o pagamento; preserva novas compras.
    delete from public.cart_items cart using public.checkout_items paid
      where paid.checkout_id=c.id and cart.client_id=c.client_id
      and cart.product_id=paid.product_id and cart.quantity=paid.quantity
      and cart.updated_at<=c.created_at;
    delete from public.cart_shipping_selections s where s.client_id=c.client_id
      and exists (select 1 from public.checkout_items ci where ci.checkout_id=c.id and ci.artisan_id=s.artisan_id)
      and s.selected_at<=c.created_at;
  end if;
  return true;
end $$;

commit;
