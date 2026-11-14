-- Tarifa fixa por item (R$ 4,00), cobrada da loja como a tarifa de 8%.
--   * A administração define o valor na tela Tarifa (0 = sem tarifa por item).
--   * A calculadora de precificação mostra a tarifa por item ao lado da % e o
--     preço sugerido já a cobre:
--       preço = (custo + lucro + tarifa por item) / (1 - (tarifa % + taxa de pagamento)/100).
--   * Na compra, o valor vigente fica congelado no checkout (como a %). Ao
--     confirmar o pagamento, finalize_checkout retém a % + tarifa por item ×
--     quantidade de peças de cada loja, e o repasse automático já sai líquido.
--     A tarifa nunca passa do valor das peças; o frete continua todo da loja.
--   * orders.platform_fee_amount e payouts.platform_fee passam a ser o TOTAL
--     retido pela Artenós (% + por item); a parte por item fica em
--     orders.item_fee_amount e payouts.item_fee.
-- Substitui a versão anterior desta migração ("custo por item" somado ao preço
-- da vitrine): se ela chegou a rodar, os objetos dela são removidos e os
-- preços das peças voltam ao valor sem o custo somado.
-- Rode depois de 20261114_data_nascimento.sql. Pode ser repetida.
begin;

-- 0) Desfaz a versão anterior ("custo por item" no cadastro da peça) -------------
do $$
begin
  if to_regclass('public.product_item_costs') is not null then
    update public.products pr set price = greatest(0.01, round(pr.price - c.amount, 2))
      from public.product_item_costs c where c.product_id = pr.id;
    if to_regclass('public.product_variants') is not null then
      update public.product_variants v set price = greatest(0.01, round(v.price - c.amount, 2))
        from public.product_item_costs c where c.product_id = v.product_id and v.price is not null;
    end if;
    drop table public.product_item_costs;
  end if;
end $$;
drop function if exists public.set_my_product_item_cost(uuid, boolean);
drop function if exists public.list_my_product_item_costs();
drop function if exists public.admin_set_item_cost_catalog_enabled(boolean);
drop function if exists public.get_item_cost_settings();
drop function if exists public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, boolean);
drop function if exists public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, boolean);
drop function if exists public.pricing_compute(numeric, numeric, numeric, numeric, numeric, numeric, text, boolean);
alter table public.platform_pricing_settings drop column if exists item_cost_catalog_enabled;
alter table public.platform_pricing_settings drop column if exists item_cost_amount;
alter table public.artisan_pricing_calculations drop column if exists item_cost_amount;

-- 1) Configuração e colunas ---------------------------------------------------------
alter table public.platform_pricing_settings
  add column if not exists item_fee_amount numeric(12,2) not null default 4.00
    check (item_fee_amount >= 0 and item_fee_amount <= 1000);
alter table public.artisan_pricing_calculations
  add column if not exists item_fee_amount numeric(12,2) not null default 0;
-- Valor por item congelado na compra (null = compra criada antes desta migração: sem tarifa por item).
alter table public.checkouts add column if not exists item_fee_amount numeric(12,2);
alter table public.orders
  add column if not exists item_fee_unit_amount numeric(12,2) not null default 0,
  add column if not exists item_fee_amount numeric(12,2) not null default 0;
alter table public.payouts add column if not exists item_fee numeric(12,2) not null default 0;

-- Congela o valor vigente em toda compra nova (carrinho e "comprar agora"),
-- sem mexer nas funções que criam o checkout.
create or replace function public.checkout_item_fee_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.item_fee_amount is null then
    select s.item_fee_amount into new.item_fee_amount from public.platform_pricing_settings s where s.id = 1;
    new.item_fee_amount := coalesce(new.item_fee_amount, 0);
  end if;
  return new;
end $$;
revoke all on function public.checkout_item_fee_snapshot() from public, anon, authenticated;
drop trigger if exists checkout_item_fee_snapshot on public.checkouts;
create trigger checkout_item_fee_snapshot before insert on public.checkouts
  for each row execute function public.checkout_item_fee_snapshot();

-- Leitura para a calculadora (loja) e para o painel.
create or replace function public.get_item_fee_settings()
returns table (amount numeric)
language sql stable security definer set search_path = '' as $$
  select s.item_fee_amount from public.platform_pricing_settings s where s.id = 1;
$$;
revoke all on function public.get_item_fee_settings() from public, anon;
grant execute on function public.get_item_fee_settings() to authenticated;

-- Só a proprietária altera (como a tarifa %). Vale para as próximas compras.
create or replace function public.admin_update_item_fee(p_amount numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid() and a.active and a.role = 'owner') then
    raise exception 'Somente a proprietária pode alterar a tarifa por item';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000 then
    raise exception 'Informe uma tarifa por item entre R$ 0,00 e R$ 1.000,00';
  end if;
  update public.platform_pricing_settings
     set item_fee_amount = round(p_amount, 2), updated_at = now(), updated_by = auth.uid()
   where id = 1;
  return round(p_amount, 2);
end $$;
revoke all on function public.admin_update_item_fee(numeric) from public, anon;
grant execute on function public.admin_update_item_fee(numeric) to authenticated;

-- 2) Calculadora: a tarifa por item sempre entra na conta -------------------------------
-- O tipo de retorno muda (novo campo): recria.
drop function if exists public.pricing_compute(numeric, numeric, numeric, numeric, numeric, numeric, text);
create function public.pricing_compute(
  p_material_cost numeric, p_hours_spent numeric, p_hourly_rate numeric, p_extra_cost numeric,
  p_operational_cost numeric, p_margin_percent numeric, p_payment_method text,
  out fee_percent numeric, out payment_percent numeric, out labor numeric, out production numeric,
  out profit numeric, out item_fee numeric, out sale_price numeric, out fee_amount numeric, out payment_amount numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_setting public.platform_pricing_settings;
begin
  if coalesce(p_payment_method, '') not in ('card', 'pix') then raise exception 'Meio de pagamento inválido'; end if;
  if coalesce(p_material_cost, -1) < 0 or coalesce(p_hours_spent, -1) < 0 or coalesce(p_hourly_rate, -1) < 0
     or coalesce(p_extra_cost, -1) < 0 or coalesce(p_operational_cost, -1) < 0
     or coalesce(p_margin_percent, -1) < 0 or p_margin_percent > 1000 then
    raise exception 'Os valores da precificação são inválidos';
  end if;
  select * into v_setting from public.platform_pricing_settings where id = 1;
  fee_percent := coalesce(v_setting.platform_fee_percent, 8);
  payment_percent := case when p_payment_method = 'pix'
    then coalesce(v_setting.payment_fee_pix_percent, 0.99) else coalesce(v_setting.payment_fee_card_percent, 4.98) end;
  if fee_percent < 0 or payment_percent < 0 or fee_percent + payment_percent >= 100 then
    raise exception 'As tarifas configuradas são inválidas';
  end if;
  labor := round(p_hours_spent * p_hourly_rate, 2);
  production := round(p_material_cost + labor + p_extra_cost + p_operational_cost, 2);
  profit := round(production * p_margin_percent / 100, 2);
  -- Só entra quando há custo de produção (um cálculo vazio continua em zero).
  item_fee := case when production > 0 then coalesce(v_setting.item_fee_amount, 0) else 0 end;
  sale_price := round((production + profit + item_fee) / (1 - (fee_percent + payment_percent) / 100), 2);
  fee_amount := round(sale_price * fee_percent / 100, 2);
  payment_amount := round(sale_price * payment_percent / 100, 2);
end $$;
revoke all on function public.pricing_compute(numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon, authenticated;

-- 3) Salvar / editar / listar com a tarifa por item (mesmas assinaturas) ----------------
drop function if exists public.list_my_pricing_calculations(integer);

create or replace function public.save_pricing_calculation(
  p_title text, p_material_cost numeric, p_hours_spent numeric, p_hourly_rate numeric, p_extra_cost numeric,
  p_operational_cost numeric, p_margin_percent numeric, p_product_id uuid default null, p_payment_method text default 'card')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.artisan_pricing_calculations; c record; new_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.account_type = 'artisan'::public.account_type and p.approval_status = 'active'::public.approval_status) then
    raise exception 'Apenas artesãs aprovadas podem salvar cálculos';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then
    raise exception 'Informe um nome entre 2 e 120 caracteres';
  end if;
  if p_product_id is not null and not exists (
    select 1 from public.products pr where pr.id = p_product_id and pr.artisan_id = auth.uid()) then
    raise exception 'O produto selecionado não pertence à sua loja';
  end if;
  select * into c from public.pricing_compute(p_material_cost, p_hours_spent, p_hourly_rate, p_extra_cost,
    p_operational_cost, p_margin_percent, coalesce(p_payment_method, 'card'));
  insert into public.artisan_pricing_calculations (
    artisan_id, product_id, title, material_cost, hours_spent, hourly_rate, extra_cost, operational_cost,
    margin_percent, platform_fee_percent, labor_cost, production_cost, desired_profit, platform_fee_amount,
    suggested_price, payment_method, payment_fee_percent, payment_fee_amount, item_fee_amount)
  values (auth.uid(), p_product_id, btrim(p_title), round(p_material_cost, 2), round(p_hours_spent, 2),
    round(p_hourly_rate, 2), round(p_extra_cost, 2), round(p_operational_cost, 2), round(p_margin_percent, 2),
    c.fee_percent, c.labor, c.production, c.profit, c.fee_amount, c.sale_price,
    coalesce(p_payment_method, 'card'), c.payment_percent, c.payment_amount, c.item_fee)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.update_my_pricing_calculation(
  p_calculation_id uuid, p_title text, p_material_cost numeric, p_hours_spent numeric, p_hourly_rate numeric,
  p_extra_cost numeric, p_operational_cost numeric, p_margin_percent numeric, p_product_id uuid default null,
  p_payment_method text default 'card')
returns boolean language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.account_type = 'artisan'::public.account_type and p.approval_status = 'active'::public.approval_status) then
    raise exception 'Apenas artesãs aprovadas podem editar cálculos';
  end if;
  if p_calculation_id is null or not exists (
    select 1 from public.artisan_pricing_calculations x where x.id = p_calculation_id and x.artisan_id = auth.uid()) then
    raise exception 'Cálculo não encontrado ou sem permissão para editar';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then
    raise exception 'Informe um nome entre 2 e 120 caracteres';
  end if;
  if p_product_id is not null and not exists (
    select 1 from public.products pr where pr.id = p_product_id and pr.artisan_id = auth.uid()) then
    raise exception 'O produto selecionado não pertence à sua loja';
  end if;
  select * into c from public.pricing_compute(p_material_cost, p_hours_spent, p_hourly_rate, p_extra_cost,
    p_operational_cost, p_margin_percent, coalesce(p_payment_method, 'card'));
  update public.artisan_pricing_calculations set
    product_id = p_product_id, title = btrim(p_title), material_cost = round(p_material_cost, 2),
    hours_spent = round(p_hours_spent, 2), hourly_rate = round(p_hourly_rate, 2), extra_cost = round(p_extra_cost, 2),
    operational_cost = round(p_operational_cost, 2), margin_percent = round(p_margin_percent, 2),
    platform_fee_percent = c.fee_percent, labor_cost = c.labor, production_cost = c.production,
    desired_profit = c.profit, platform_fee_amount = c.fee_amount, suggested_price = c.sale_price,
    payment_method = coalesce(p_payment_method, 'card'), payment_fee_percent = c.payment_percent,
    payment_fee_amount = c.payment_amount, item_fee_amount = c.item_fee, updated_at = now()
  where id = p_calculation_id and artisan_id = auth.uid();
  return found;
end $$;

create or replace function public.list_my_pricing_calculations(p_limit integer default 12)
returns table (
  id uuid, product_id uuid, product_name text, title text, material_cost numeric, hours_spent numeric,
  hourly_rate numeric, extra_cost numeric, operational_cost numeric, margin_percent numeric,
  platform_fee_percent numeric, labor_cost numeric, production_cost numeric, desired_profit numeric,
  platform_fee_amount numeric, suggested_price numeric, payment_method text, payment_fee_percent numeric,
  payment_fee_amount numeric, item_fee_amount numeric, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.product_id, p.name, c.title, c.material_cost, c.hours_spent, c.hourly_rate, c.extra_cost,
    c.operational_cost, c.margin_percent, c.platform_fee_percent, c.labor_cost, c.production_cost,
    c.desired_profit, c.platform_fee_amount, c.suggested_price, c.payment_method, c.payment_fee_percent,
    c.payment_fee_amount, c.item_fee_amount, c.created_at
  from public.artisan_pricing_calculations c
  left join public.products p on p.id = c.product_id
  where c.artisan_id = auth.uid()
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) from public, anon;
revoke all on function public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) from public, anon;
revoke all on function public.list_my_pricing_calculations(integer) from public, anon;
grant execute on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) to authenticated;
grant execute on function public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) to authenticated;
grant execute on function public.list_my_pricing_calculations(integer) to authenticated;


-- 4) Vendas da loja com o detalhe da tarifa por item ---------------------------------
drop function if exists public.list_my_sales_financials();
create function public.list_my_sales_financials()
returns table (order_id uuid, platform_fee_percent numeric, platform_fee_amount numeric,
  item_fee_amount numeric, artisan_net_amount numeric)
language sql stable security definer set search_path = '' as $$
  select sale.id, sale.platform_fee_percent, sale.platform_fee_amount, sale.item_fee_amount, sale.artisan_net_amount
  from public.orders sale
  where sale.artisan_id = auth.uid()
  order by sale.created_at desc;
$$;
revoke all on function public.list_my_sales_financials() from public, anon;
grant execute on function public.list_my_sales_financials() to authenticated;

-- 5) Fechamento da compra: retém a % + a tarifa por item ------------------------------
create or replace function public.finalize_checkout(
  p_checkout_id uuid,p_mp_payment_id text,p_payment_method text,
  p_gateway_fee numeric,p_fee_percent numeric,p_hold_days integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c public.checkouts; seller record; q jsonb; v_order_id uuid;
  freight numeric; fee numeric; item_fee numeric; gateway numeric; fee_left numeric;
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
  for seller in select artisan_id,sum(line_total) as subtotal,sum(quantity) as units
    from public.checkout_items where checkout_id=c.id group by artisan_id order by artisan_id
  loop
    select value into q from jsonb_array_elements(c.shipping_snapshot)
      where value->>'artisan_id'=seller.artisan_id::text;
    if q is null then raise exception 'Frete congelado não encontrado'; end if;
    freight:=(q->>'price')::numeric; total:=seller.subtotal+freight;
    fee:=round(seller.subtotal*c.platform_fee_percent/100,2);
    -- Tarifa fixa por item (congelada na compra), retida como a porcentagem.
    -- Nunca passa do valor das peças (o frete continua todo da loja).
    item_fee:=least(round(coalesce(c.item_fee_amount,0)*seller.units,2),greatest(seller.subtotal-fee,0));
    fee:=fee+item_fee;
    gateway:=case when abs(remaining_total-total)<0.01 then fee_left
      else least(fee_left,round(greatest(coalesce(p_gateway_fee,0),0)*total/c.total_amount,2)) end;
    remaining_total:=remaining_total-total; fee_left:=fee_left-gateway;
    insert into public.orders(checkout_id,client_id,artisan_id,product_name,status,
      payment_status,payment_reference,subtotal,shipping_amount,total_amount,
      platform_fee_percent,platform_fee_amount,item_fee_unit_amount,item_fee_amount,artisan_net_amount,
      recipient_name,shipping_cep,shipping_address,shipping_number,shipping_city,shipping_state,
      carrier,estimated_delivery_date,shipping_provider,shipping_service_id,
      shipping_service_name,shipping_company,shipping_delivery_min_days,
      shipping_delivery_max_days,shipping_production_days,shipping_quote_id)
    values(c.id,c.client_id,seller.artisan_id,
      (select string_agg(product_name,', ') from public.checkout_items where checkout_id=c.id and artisan_id=seller.artisan_id),
      'payment_confirmed','paid',p_mp_payment_id,seller.subtotal,freight,total,
      c.platform_fee_percent,fee,coalesce(c.item_fee_amount,0),item_fee,greatest(total-fee-gateway,0),
      c.buyer_snapshot->>'full_name',c.buyer_snapshot->>'cep',c.buyer_snapshot->>'address',
      c.buyer_snapshot->>'address_number',c.buyer_snapshot->>'city',c.buyer_snapshot->>'state',
      (q->>'company_name')||' - '||(q->>'service_name'),
      current_date+(q->>'total_delivery_max_days')::integer,q->>'provider',
      (q->>'service_id')::integer,q->>'service_name',q->>'company_name',
      (q->>'carrier_delivery_min_days')::integer,(q->>'carrier_delivery_max_days')::integer,
      (q->>'production_time_days')::integer,
      (select id from public.shipping_quotes where id=(q->>'id')::uuid)) returning id into v_order_id;
    insert into public.order_items(order_id,product_id,variant_id,variant_label,product_name,image_url,quantity,unit_price,subtotal,made_to_order)
      select v_order_id,product_id,variant_id,variant_label,product_name,image_url,quantity,unit_price,line_total,made_to_order
      from public.checkout_items where checkout_id=c.id and artisan_id=seller.artisan_id;
    insert into public.order_status_history(order_id,status,description)
      values(v_order_id,'payment_confirmed','Pagamento confirmado pelo Mercado Pago; frete e estoque registrados.');
    insert into public.conversations(order_id,client_id,artisan_id)
      values(v_order_id,c.client_id,seller.artisan_id) on conflict(order_id) do nothing;
    insert into public.payouts(checkout_id,artisan_id,gross_amount,platform_fee,item_fee,gateway_fee,net_amount,release_after)
      values(c.id,seller.artisan_id,total,fee,item_fee,gateway,greatest(total-fee-gateway,0),
        now()+make_interval(days=>greatest(coalesce(p_hold_days,0),0)))
      on conflict(checkout_id,artisan_id) do nothing;
  end loop;
  update public.checkouts set status='approved',paid_at=now(),mp_payment_id=p_mp_payment_id,
    mp_status='approved',payment_method=p_payment_method,gateway_fee=p_gateway_fee,
    pix_qr_code=null,pix_qr_code_base64=null where id=c.id;
  if c.source='buy_now' then
    delete from public.buy_now_intents where client_id=c.client_id;
  else
    delete from public.cart_items cart using public.checkout_items paid
      where paid.checkout_id=c.id and cart.client_id=c.client_id
      and cart.product_id=paid.product_id and cart.variant_id is not distinct from paid.variant_id
      and cart.quantity=paid.quantity and cart.updated_at<=c.created_at;
    delete from public.cart_shipping_selections s where s.client_id=c.client_id
      and exists (select 1 from public.checkout_items ci where ci.checkout_id=c.id and ci.artisan_id=s.artisan_id)
      and s.selected_at<=c.created_at;
  end if;
  return true;
end $$;

commit;
