-- Artenós: etapa 4 - cotação e seleção real de frete por loja.
-- Execute TODO este arquivo uma única vez depois de dados_frete.sql e
-- tarifa_plataforma.sql.
-- Não altera pedidos antigos nem inventa valores de frete.

begin;

create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'melhor_envio',
  destination_cep text not null check (destination_cep ~ '^[0-9]{8}$'),
  cart_signature text not null,
  service_id integer not null,
  service_name text not null,
  company_name text not null,
  price numeric(12,2) not null check (price >= 0),
  carrier_delivery_min_days integer not null check (carrier_delivery_min_days >= 0),
  carrier_delivery_max_days integer not null check (carrier_delivery_max_days >= carrier_delivery_min_days),
  production_time_days integer not null check (production_time_days between 0 and 180),
  total_delivery_min_days integer not null check (total_delivery_min_days >= 0),
  total_delivery_max_days integer not null check (total_delivery_max_days >= total_delivery_min_days),
  quoted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  check (expires_at > quoted_at)
);

create index if not exists shipping_quotes_client_artisan_idx
  on public.shipping_quotes (client_id, artisan_id, expires_at desc);

create table if not exists public.cart_shipping_selections (
  client_id uuid not null references public.profiles(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  quote_id uuid not null references public.shipping_quotes(id) on delete cascade,
  selected_at timestamptz not null default now(),
  primary key (client_id, artisan_id),
  unique (quote_id)
);

alter table public.shipping_quotes enable row level security;
alter table public.cart_shipping_selections enable row level security;

revoke all on public.shipping_quotes from public, anon, authenticated;
revoke all on public.cart_shipping_selections from public, anon, authenticated;
grant select, insert, update, delete on public.shipping_quotes to service_role;
grant select, insert, update, delete on public.cart_shipping_selections to service_role;

alter table public.orders
  add column if not exists shipping_complement text,
  add column if not exists carrier text,
  add column if not exists estimated_delivery_date date,
  add column if not exists shipping_provider text,
  add column if not exists shipping_service_id integer,
  add column if not exists shipping_service_name text,
  add column if not exists shipping_company text,
  add column if not exists shipping_delivery_min_days integer,
  add column if not exists shipping_delivery_max_days integer,
  add column if not exists shipping_production_days integer,
  add column if not exists shipping_quote_id uuid references public.shipping_quotes(id) on delete set null;

-- Assinatura determinística do conteúdo do carrinho usado na cotação.
-- Qualquer alteração de item, quantidade, preço ou embalagem invalida a escolha.
create or replace function public.current_cart_shipping_signature(
  p_client_id uuid,
  p_artisan_id uuid,
  p_destination_cep text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(
    coalesce(
      string_agg(
        concat_ws(':',
          item.product_id::text,
          item.quantity::text,
          item.unit_price::text,
          product.shipping_weight_grams::text,
          product.shipping_height_cm::text,
          product.shipping_width_cm::text,
          product.shipping_length_cm::text,
          product.shipping_package_count::text,
          product.production_time_days::text,
          product.updated_at::text
        ),
        '|' order by item.product_id
      ),
      ''
    ) || ':' || coalesce(p_destination_cep, '') || ':' || coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')
    )
  )
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles artisan on artisan.id = item.artisan_id
  left join public.artisan_store_settings setting
    on setting.artisan_id = item.artisan_id
  where item.client_id = p_client_id
    and item.artisan_id = p_artisan_id
  group by setting.shipping_origin_cep, artisan.cep;
$$;

revoke all on function public.current_cart_shipping_signature(uuid, uuid, text)
  from public, anon, authenticated;

-- Entrega ao backend apenas dados do carrinho autenticado. O navegador não
-- envia peso, preço ou dimensões para a transportadora.
create or replace function public.get_cart_shipping_packages(p_destination_cep text)
returns table (
  artisan_id uuid,
  store_name text,
  origin_cep text,
  destination_cep text,
  cart_signature text,
  product_id uuid,
  product_name text,
  unit_price numeric,
  quantity integer,
  weight_grams integer,
  height_cm numeric,
  width_cm numeric,
  length_cm numeric,
  package_count integer,
  production_time_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_destination text := regexp_replace(coalesce(p_destination_cep, ''), '\D', '', 'g');
begin
  if auth.uid() is null then
    raise exception 'Faça login para calcular o frete';
  end if;

  if normalized_destination !~ '^[0-9]{8}$' then
    raise exception 'Informe um CEP de destino com 8 números';
  end if;

  return query
  select
    item.artisan_id,
    coalesce(artisan.store_name, artisan.full_name),
    coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')
    ),
    normalized_destination,
    public.current_cart_shipping_signature(
      auth.uid(), item.artisan_id, normalized_destination
    ),
    product.id,
    product.name,
    item.unit_price,
    item.quantity,
    product.shipping_weight_grams,
    product.shipping_height_cm,
    product.shipping_width_cm,
    product.shipping_length_cm,
    product.shipping_package_count,
    coalesce(
      product.production_time_days,
      case when product.ready_to_ship then 0 else setting.production_time_days end
    )
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles artisan on artisan.id = item.artisan_id
  left join public.artisan_store_settings setting
    on setting.artisan_id = item.artisan_id
  where item.client_id = auth.uid()
    and product.active
    and artisan.account_type = 'artisan'::public.account_type
    and artisan.approval_status = 'active'::public.approval_status
  order by item.artisan_id, item.created_at, item.id;
end;
$$;

create or replace function public.select_cart_shipping_quote(p_quote_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_quote public.shipping_quotes;
  buyer_cep text;
  current_signature text;
begin
  if auth.uid() is null then
    raise exception 'Faça login para selecionar o frete';
  end if;

  select regexp_replace(profile.cep, '\D', '', 'g')
  into buyer_cep
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.approval_status = 'active';

  select quote.*
  into selected_quote
  from public.shipping_quotes quote
  where quote.id = p_quote_id
    and quote.client_id = auth.uid()
    and quote.expires_at > now();

  if not found then
    raise exception 'Cotação não encontrada ou expirada';
  end if;

  if selected_quote.destination_cep is distinct from buyer_cep then
    raise exception 'O CEP do cadastro mudou. Calcule o frete novamente';
  end if;

  current_signature := public.current_cart_shipping_signature(
    auth.uid(), selected_quote.artisan_id, selected_quote.destination_cep
  );

  if current_signature is null
    or current_signature is distinct from selected_quote.cart_signature then
    raise exception 'O carrinho mudou. Calcule o frete novamente';
  end if;

  insert into public.cart_shipping_selections as selection (
    client_id, artisan_id, quote_id, selected_at
  ) values (
    auth.uid(), selected_quote.artisan_id, selected_quote.id, now()
  )
  on conflict (client_id, artisan_id) do update
    set quote_id = excluded.quote_id,
        selected_at = excluded.selected_at;

  return true;
end;
$$;

-- Substitui o checkout mais recente, preservando estoque e tarifa da
-- plataforma. Agora cria um pedido por loja e aplica o frete real escolhido.
create or replace function public.checkout_cart()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer public.profiles;
  v_artisan record;
  v_item record;
  v_quote public.shipping_quotes;
  v_order_id uuid;
  v_count integer := 0;
  v_fee_percent numeric(5,2);
  v_subtotal numeric(12,2);
  v_fee_amount numeric(12,2);
  v_shipping numeric(12,2);
  v_artisan_net numeric(12,2);
  v_product_names text;
  v_buyer_cep text;
begin
  if auth.uid() is null then
    raise exception 'Faça login para comprar';
  end if;

  select profile.* into v_buyer
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.approval_status = 'active';

  if not found then
    raise exception 'Comprador inválido ou inativo';
  end if;

  v_buyer_cep := regexp_replace(v_buyer.cep, '\D', '', 'g');
  if v_buyer_cep !~ '^[0-9]{8}$' then
    raise exception 'Complete o CEP do seu perfil antes de comprar';
  end if;

  if not exists (
    select 1 from public.cart_items where client_id = auth.uid()
  ) then
    raise exception 'Seu carrinho está vazio';
  end if;

  select setting.platform_fee_percent into v_fee_percent
  from public.platform_pricing_settings setting
  where setting.id = 1;

  v_fee_percent := coalesce(v_fee_percent, 8);
  if v_fee_percent < 0 or v_fee_percent >= 100 then
    raise exception 'A tarifa da plataforma está configurada incorretamente';
  end if;

  perform product.id
  from public.products product
  join public.cart_items item on item.product_id = product.id
  where item.client_id = auth.uid()
  order by product.id
  for update of product;

  for v_artisan in
    select distinct item.artisan_id
    from public.cart_items item
    where item.client_id = auth.uid()
    order by item.artisan_id
  loop
    select quote.* into v_quote
    from public.cart_shipping_selections selection
    join public.shipping_quotes quote on quote.id = selection.quote_id
    where selection.client_id = auth.uid()
      and selection.artisan_id = v_artisan.artisan_id
      and quote.client_id = auth.uid()
      and quote.artisan_id = v_artisan.artisan_id
      and quote.destination_cep = v_buyer_cep
      and quote.expires_at > now()
      and quote.cart_signature = public.current_cart_shipping_signature(
        auth.uid(), v_artisan.artisan_id, v_buyer_cep
      );

    if not found then
      raise exception 'Selecione um frete válido para cada loja antes de finalizar';
    end if;

    select
      round(sum(item.unit_price * item.quantity), 2),
      string_agg(product.name, ', ' order by item.created_at, item.id)
    into v_subtotal, v_product_names
    from public.cart_items item
    join public.products product on product.id = item.product_id
    where item.client_id = auth.uid()
      and item.artisan_id = v_artisan.artisan_id;

    for v_item in
      select item.*, product.name, product.image_url, product.stock, product.active
      from public.cart_items item
      join public.products product on product.id = item.product_id
      where item.client_id = auth.uid()
        and item.artisan_id = v_artisan.artisan_id
      order by item.created_at, item.id
    loop
      if not v_item.active or not public.is_public_artisan(v_item.artisan_id) then
        raise exception 'O produto % não está mais disponível', v_item.name;
      end if;
      if v_item.stock is not null and v_item.quantity > v_item.stock then
        raise exception 'Estoque insuficiente para %. Restam % unidade(s).',
          v_item.name, v_item.stock;
      end if;
    end loop;

    v_shipping := v_quote.price;
    v_fee_amount := round(v_subtotal * v_fee_percent / 100, 2);
    v_artisan_net := round(v_subtotal - v_fee_amount + v_shipping, 2);

    insert into public.orders (
      client_id, artisan_id, product_name, status, payment_status,
      payment_reference, subtotal, shipping_amount, total_amount,
      platform_fee_percent, platform_fee_amount, artisan_net_amount,
      recipient_name, shipping_cep, shipping_address, shipping_number,
      shipping_complement, shipping_city, shipping_state,
      carrier, estimated_delivery_date, shipping_provider,
      shipping_service_id, shipping_service_name, shipping_company,
      shipping_delivery_min_days, shipping_delivery_max_days,
      shipping_production_days, shipping_quote_id
    ) values (
      auth.uid(), v_artisan.artisan_id, v_product_names,
      'payment_confirmed', 'paid', 'cart-test:' || gen_random_uuid()::text,
      v_subtotal, v_shipping, v_subtotal + v_shipping,
      v_fee_percent, v_fee_amount, v_artisan_net,
      v_buyer.full_name, v_buyer_cep, v_buyer.address,
      v_buyer.address_number, null,
      v_buyer.city, upper(v_buyer.state),
      v_quote.company_name || ' - ' || v_quote.service_name,
      current_date + v_quote.total_delivery_max_days,
      v_quote.provider, v_quote.service_id, v_quote.service_name,
      v_quote.company_name, v_quote.carrier_delivery_min_days,
      v_quote.carrier_delivery_max_days, v_quote.production_time_days,
      v_quote.id
    ) returning id into v_order_id;

    for v_item in
      select item.*, product.name, product.image_url, product.stock
      from public.cart_items item
      join public.products product on product.id = item.product_id
      where item.client_id = auth.uid()
        and item.artisan_id = v_artisan.artisan_id
      order by item.created_at, item.id
    loop
      insert into public.order_items (
        order_id, product_id, product_name, image_url,
        quantity, unit_price, subtotal
      ) values (
        v_order_id, v_item.product_id, v_item.name, v_item.image_url,
        v_item.quantity, v_item.unit_price,
        round(v_item.unit_price * v_item.quantity, 2)
      );

      if v_item.stock is not null then
        update public.products
        set stock = stock - v_item.quantity, updated_at = now()
        where id = v_item.product_id;
      end if;
    end loop;

    insert into public.order_status_history (order_id, status, description)
    values (
      v_order_id,
      'payment_confirmed',
      'Compra confirmada. Frete ' || v_quote.company_name || ' - ' ||
      v_quote.service_name || ' selecionado.'
    );

    insert into public.conversations (order_id, client_id, artisan_id)
    values (v_order_id, auth.uid(), v_artisan.artisan_id)
    on conflict (order_id) do nothing;

    v_count := v_count + 1;
  end loop;

  delete from public.cart_items where client_id = auth.uid();
  delete from public.cart_shipping_selections where client_id = auth.uid();
  return v_count;
end;
$$;

revoke all on function public.get_cart_shipping_packages(text) from public, anon;
revoke all on function public.select_cart_shipping_quote(uuid) from public, anon;
revoke all on function public.checkout_cart() from public, anon;

grant execute on function public.get_cart_shipping_packages(text) to authenticated;
grant execute on function public.select_cart_shipping_quote(uuid) to authenticated;
grant execute on function public.checkout_cart() to authenticated;

commit;

-- Conferência opcional, sem alterar dados:
-- select * from public.shipping_quotes order by quoted_at desc limit 20;
-- select * from public.cart_shipping_selections order by selected_at desc;
-- select id, shipping_amount, shipping_company, shipping_service_name,
--        shipping_delivery_min_days, shipping_delivery_max_days,
--        shipping_production_days
-- from public.orders order by created_at desc limit 20;
