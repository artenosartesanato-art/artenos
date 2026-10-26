-- Artenós: etapa 2 - tarifa percentual da plataforma sobre vendas.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase.
--
-- Regras:
-- 1. A tarifa incide somente sobre o subtotal dos produtos, nunca sobre o frete.
-- 2. Cada novo pedido guarda o percentual aplicado naquele momento.
-- 3. Pedidos anteriores recebem tarifa zero; nenhuma cobrança é retroativa.
-- 4. Somente uma administradora proprietária ativa pode alterar a tarifa.

begin;

create table if not exists public.platform_pricing_settings (
  id smallint primary key default 1 check (id = 1),
  platform_fee_percent numeric(5,2) not null default 8
    check (platform_fee_percent >= 0 and platform_fee_percent <= 100),
  updated_at timestamptz not null default now()
);

alter table public.platform_pricing_settings
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

insert into public.platform_pricing_settings (id, platform_fee_percent)
values (1, 8)
on conflict (id) do nothing;

create table if not exists public.platform_fee_audit (
  id uuid primary key default gen_random_uuid(),
  previous_percent numeric(5,2) not null,
  new_percent numeric(5,2) not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists platform_fee_audit_created_idx
  on public.platform_fee_audit (created_at desc);

alter table public.platform_pricing_settings enable row level security;
alter table public.platform_fee_audit enable row level security;
revoke all on public.platform_pricing_settings from public, anon, authenticated;
revoke all on public.platform_fee_audit from public, anon, authenticated;

alter table public.orders
  add column if not exists platform_fee_percent numeric(5,2),
  add column if not exists platform_fee_amount numeric(12,2),
  add column if not exists artisan_net_amount numeric(12,2);

-- Não aplica tarifa retroativa. O líquido antigo continua sendo subtotal + frete.
update public.orders
set
  platform_fee_percent = coalesce(platform_fee_percent, 0),
  platform_fee_amount = coalesce(platform_fee_amount, 0),
  artisan_net_amount = coalesce(
    artisan_net_amount,
    greatest(coalesce(subtotal, 0) + coalesce(shipping_amount, 0), 0)
  )
where platform_fee_percent is null
   or platform_fee_amount is null
   or artisan_net_amount is null;

alter table public.orders
  alter column platform_fee_percent set default 0,
  alter column platform_fee_percent set not null,
  alter column platform_fee_amount set default 0,
  alter column platform_fee_amount set not null,
  alter column artisan_net_amount set default 0,
  alter column artisan_net_amount set not null;

create or replace function public.get_admin_platform_fee()
returns table (
  platform_fee_percent numeric,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Acesso administrativo não autorizado';
  end if;

  return query
  select setting.platform_fee_percent, setting.updated_at, setting.updated_by
  from public.platform_pricing_settings setting
  where setting.id = 1;
end;
$$;

create or replace function public.admin_update_platform_fee(
  p_platform_fee_percent numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := auth.uid();
  previous_value numeric(5,2);
  normalized_value numeric(5,2);
begin
  if current_admin_id is null or not exists (
    select 1
    from public.admin_users administrator
    where administrator.user_id = current_admin_id
      and administrator.active
      and administrator.role = 'owner'
  ) then
    raise exception 'Somente a proprietária pode alterar a tarifa';
  end if;

  if p_platform_fee_percent is null
    or p_platform_fee_percent < 0
    or p_platform_fee_percent >= 100 then
    raise exception 'A tarifa deve estar entre 0 e 99,99 por cento';
  end if;

  normalized_value := round(p_platform_fee_percent, 2);

  select setting.platform_fee_percent
  into previous_value
  from public.platform_pricing_settings setting
  where setting.id = 1
  for update;

  if previous_value is distinct from normalized_value then
    update public.platform_pricing_settings
    set
      platform_fee_percent = normalized_value,
      updated_at = now(),
      updated_by = current_admin_id
    where id = 1;

    insert into public.platform_fee_audit (
      previous_percent,
      new_percent,
      changed_by
    ) values (
      previous_value,
      normalized_value,
      current_admin_id
    );
  end if;

  return normalized_value;
end;
$$;

create or replace function public.list_my_sales_financials()
returns table (
  order_id uuid,
  platform_fee_percent numeric,
  platform_fee_amount numeric,
  artisan_net_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sale.id,
    sale.platform_fee_percent,
    sale.platform_fee_amount,
    sale.artisan_net_amount
  from public.orders sale
  where sale.artisan_id = auth.uid()
  order by sale.created_at desc;
$$;

-- Corrige também a calculadora: a tarifa é descontada do preço final da venda.
create or replace function public.save_pricing_calculation(
  p_title text,
  p_material_cost numeric,
  p_hours_spent numeric,
  p_hourly_rate numeric,
  p_extra_cost numeric,
  p_operational_cost numeric,
  p_margin_percent numeric,
  p_product_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  fee_percent numeric(5,2);
  labor numeric(12,2);
  production numeric(12,2);
  profit numeric(12,2);
  sale_price numeric(12,2);
  fee_amount numeric(12,2);
  new_id uuid;
begin
  if current_user_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = current_user_id
      and profile.account_type = 'artisan'::public.account_type
      and profile.approval_status = 'active'::public.approval_status
  ) then
    raise exception 'Apenas artesãs aprovadas podem salvar cálculos';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then
    raise exception 'Informe um nome entre 2 e 120 caracteres';
  end if;

  if coalesce(p_material_cost, -1) < 0
    or coalesce(p_hours_spent, -1) < 0
    or coalesce(p_hourly_rate, -1) < 0
    or coalesce(p_extra_cost, -1) < 0
    or coalesce(p_operational_cost, -1) < 0
    or coalesce(p_margin_percent, -1) < 0
    or p_margin_percent > 1000 then
    raise exception 'Os valores da precificação são inválidos';
  end if;

  if p_product_id is not null and not exists (
    select 1
    from public.products product
    where product.id = p_product_id
      and product.artisan_id = current_user_id
  ) then
    raise exception 'O produto selecionado não pertence à sua loja';
  end if;

  select setting.platform_fee_percent
  into fee_percent
  from public.platform_pricing_settings setting
  where setting.id = 1;

  fee_percent := coalesce(fee_percent, 8);
  if fee_percent < 0 or fee_percent >= 100 then
    raise exception 'A tarifa configurada é inválida';
  end if;

  labor := round(p_hours_spent * p_hourly_rate, 2);
  production := round(p_material_cost + labor + p_extra_cost + p_operational_cost, 2);
  profit := round(production * p_margin_percent / 100, 2);
  sale_price := round((production + profit) / (1 - fee_percent / 100), 2);
  fee_amount := round(sale_price * fee_percent / 100, 2);

  insert into public.artisan_pricing_calculations (
    artisan_id,
    product_id,
    title,
    material_cost,
    hours_spent,
    hourly_rate,
    extra_cost,
    operational_cost,
    margin_percent,
    platform_fee_percent,
    labor_cost,
    production_cost,
    desired_profit,
    platform_fee_amount,
    suggested_price
  ) values (
    current_user_id,
    p_product_id,
    btrim(p_title),
    round(p_material_cost, 2),
    round(p_hours_spent, 2),
    round(p_hourly_rate, 2),
    round(p_extra_cost, 2),
    round(p_operational_cost, 2),
    round(p_margin_percent, 2),
    fee_percent,
    labor,
    production,
    profit,
    fee_amount,
    sale_price
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- Mantém o checkout atual e adiciona o retrato financeiro da venda.
create or replace function public.checkout_cart()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer public.profiles;
  v_item record;
  v_order_id uuid;
  v_count integer := 0;
  v_fee_percent numeric(5,2);
  v_subtotal numeric(12,2);
  v_fee_amount numeric(12,2);
  v_shipping numeric(12,2) := 0;
  v_artisan_net numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Faça login para comprar';
  end if;

  select profile.*
  into v_buyer
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.approval_status = 'active';

  if not found then
    raise exception 'Comprador inválido ou inativo';
  end if;

  if not exists (
    select 1 from public.cart_items where client_id = auth.uid()
  ) then
    raise exception 'Seu carrinho está vazio';
  end if;

  select setting.platform_fee_percent
  into v_fee_percent
  from public.platform_pricing_settings setting
  where setting.id = 1;

  v_fee_percent := coalesce(v_fee_percent, 8);
  if v_fee_percent < 0 or v_fee_percent >= 100 then
    raise exception 'A tarifa da plataforma está configurada incorretamente';
  end if;

  -- Ordem fixa de bloqueio preserva o controle de estoque concorrente existente.
  perform product.id
  from public.products product
  join public.cart_items item on item.product_id = product.id
  where item.client_id = auth.uid()
  order by product.id
  for update of product;

  for v_item in
    select
      item.product_id,
      item.artisan_id,
      item.unit_price,
      item.quantity,
      product.name,
      product.image_url,
      product.stock,
      product.active
    from public.cart_items item
    join public.products product on product.id = item.product_id
    where item.client_id = auth.uid()
    order by item.created_at, item.id
  loop
    if not v_item.active or not public.is_public_artisan(v_item.artisan_id) then
      raise exception 'O produto % não está mais disponível', v_item.name;
    end if;

    if v_item.stock is not null and v_item.quantity > v_item.stock then
      raise exception 'Estoque insuficiente para %. Restam % unidade(s).', v_item.name, v_item.stock;
    end if;

    v_subtotal := round(v_item.unit_price * v_item.quantity, 2);
    v_fee_amount := round(v_subtotal * v_fee_percent / 100, 2);
    v_artisan_net := round(v_subtotal - v_fee_amount + v_shipping, 2);

    insert into public.orders (
      client_id,
      artisan_id,
      product_name,
      status,
      payment_status,
      payment_reference,
      subtotal,
      shipping_amount,
      total_amount,
      platform_fee_percent,
      platform_fee_amount,
      artisan_net_amount,
      recipient_name,
      shipping_cep,
      shipping_address,
      shipping_number,
      shipping_city,
      shipping_state
    ) values (
      auth.uid(),
      v_item.artisan_id,
      v_item.name,
      'payment_confirmed',
      'paid',
      'cart-test:' || gen_random_uuid()::text,
      v_subtotal,
      v_shipping,
      v_subtotal + v_shipping,
      v_fee_percent,
      v_fee_amount,
      v_artisan_net,
      v_buyer.full_name,
      regexp_replace(v_buyer.cep, '\D', '', 'g'),
      v_buyer.address,
      v_buyer.address_number,
      v_buyer.city,
      upper(v_buyer.state)
    )
    returning id into v_order_id;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      image_url,
      quantity,
      unit_price,
      subtotal
    ) values (
      v_order_id,
      v_item.product_id,
      v_item.name,
      v_item.image_url,
      v_item.quantity,
      v_item.unit_price,
      v_subtotal
    );

    insert into public.order_status_history (order_id, status, description)
    values (
      v_order_id,
      'payment_confirmed',
      'Compra confirmada e enviada para preparação.'
    );

    insert into public.conversations (order_id, client_id, artisan_id)
    values (v_order_id, auth.uid(), v_item.artisan_id)
    on conflict (order_id) do nothing;

    if v_item.stock is not null then
      update public.products
      set stock = stock - v_item.quantity, updated_at = now()
      where id = v_item.product_id;
    end if;

    v_count := v_count + 1;
  end loop;

  delete from public.cart_items where client_id = auth.uid();
  return v_count;
end;
$$;

revoke all on function public.get_admin_platform_fee() from public, anon;
revoke all on function public.admin_update_platform_fee(numeric) from public, anon;
revoke all on function public.list_my_sales_financials() from public, anon;
revoke all on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid) from public, anon;
revoke all on function public.checkout_cart() from public, anon;

grant execute on function public.get_admin_platform_fee() to authenticated;
grant execute on function public.admin_update_platform_fee(numeric) to authenticated;
grant execute on function public.list_my_sales_financials() to authenticated;
grant execute on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid) to authenticated;
grant execute on function public.checkout_cart() to authenticated;

commit;

-- Conferência opcional, sem modificar dados:
-- select * from public.platform_pricing_settings;
-- select id, subtotal, shipping_amount, total_amount, platform_fee_percent,
--        platform_fee_amount, artisan_net_amount
-- from public.orders order by created_at desc limit 20;
-- select * from public.platform_fee_audit order by created_at desc;
