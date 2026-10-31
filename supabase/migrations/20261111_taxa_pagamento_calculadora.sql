-- Calculadora de precificação: inclui a taxa do Mercado Pago.
-- Antes, o preço sugerido só descontava a tarifa da Artenós (ex.: 8%). Mas a
-- cada venda o Mercado Pago também retira a taxa dele, que depende do meio
-- de pagamento (Pix ou cartão). Agora:
--   * a administração guarda as taxas do Mercado Pago (Pix e cartão) na tela
--     Tarifa, porque elas mudam com o tempo e com a conta;
--   * a calculadora escolhe o meio considerado (padrão: cartão, o mais caro,
--     para o preço nunca ficar curto) e mostra quanto sai de cada taxa;
--   * preço sugerido = (custo + lucro) / (1 - (tarifa + taxa de pagamento)/100).
-- Rode depois de calculadora_precificacao.sql, tarifa_plataforma.sql e
-- editar_calculo_precificacao.sql.
begin;

-- 1) Taxas do Mercado Pago (valores de referência para vendas online) ----------
alter table public.platform_pricing_settings
  add column if not exists payment_fee_pix_percent numeric(5,2) not null default 0.99
    check (payment_fee_pix_percent >= 0 and payment_fee_pix_percent < 30),
  add column if not exists payment_fee_card_percent numeric(5,2) not null default 4.98
    check (payment_fee_card_percent >= 0 and payment_fee_card_percent < 30);

alter table public.artisan_pricing_calculations
  add column if not exists payment_method text not null default 'card' check (payment_method in ('card', 'pix')),
  add column if not exists payment_fee_percent numeric(5,2) not null default 0,
  add column if not exists payment_fee_amount numeric(12,2) not null default 0;

-- Leitura para a calculadora (vendedora) e para o painel.
create or replace function public.get_payment_fee_settings()
returns table (pix_percent numeric, card_percent numeric)
language sql stable security definer set search_path = '' as $$
  select s.payment_fee_pix_percent, s.payment_fee_card_percent
  from public.platform_pricing_settings s where s.id = 1;
$$;
revoke all on function public.get_payment_fee_settings() from public, anon;
grant execute on function public.get_payment_fee_settings() to authenticated;

-- Só a proprietária altera (como a tarifa da plataforma).
create or replace function public.admin_update_payment_fees(p_pix_percent numeric, p_card_percent numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid() and a.active and a.role = 'owner') then
    raise exception 'Somente a proprietária pode alterar as taxas';
  end if;
  if p_pix_percent is null or p_card_percent is null
     or p_pix_percent < 0 or p_pix_percent >= 30 or p_card_percent < 0 or p_card_percent >= 30 then
    raise exception 'As taxas devem estar entre 0 e 29,99 por cento';
  end if;
  update public.platform_pricing_settings
     set payment_fee_pix_percent = round(p_pix_percent, 2),
         payment_fee_card_percent = round(p_card_percent, 2),
         updated_at = now(), updated_by = auth.uid()
   where id = 1;
end $$;
revoke all on function public.admin_update_payment_fees(numeric, numeric) from public, anon;
grant execute on function public.admin_update_payment_fees(numeric, numeric) to authenticated;

-- 2) Cálculo único (usado ao salvar e ao editar) ---------------------------------
create or replace function public.pricing_compute(
  p_material_cost numeric, p_hours_spent numeric, p_hourly_rate numeric, p_extra_cost numeric,
  p_operational_cost numeric, p_margin_percent numeric, p_payment_method text,
  out fee_percent numeric, out payment_percent numeric, out labor numeric, out production numeric,
  out profit numeric, out sale_price numeric, out fee_amount numeric, out payment_amount numeric)
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
  sale_price := round((production + profit) / (1 - (fee_percent + payment_percent) / 100), 2);
  fee_amount := round(sale_price * fee_percent / 100, 2);
  payment_amount := round(sale_price * payment_percent / 100, 2);
end $$;
revoke all on function public.pricing_compute(numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon, authenticated;

-- 3) Salvar / editar / listar com a taxa de pagamento ----------------------------
-- A assinatura muda (novo parâmetro): as versões antigas saem para não haver
-- chamadas ambíguas.
drop function if exists public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid);
drop function if exists public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid);
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
    suggested_price, payment_method, payment_fee_percent, payment_fee_amount)
  values (auth.uid(), p_product_id, btrim(p_title), round(p_material_cost, 2), round(p_hours_spent, 2),
    round(p_hourly_rate, 2), round(p_extra_cost, 2), round(p_operational_cost, 2), round(p_margin_percent, 2),
    c.fee_percent, c.labor, c.production, c.profit, c.fee_amount, c.sale_price,
    coalesce(p_payment_method, 'card'), c.payment_percent, c.payment_amount)
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
    payment_fee_amount = c.payment_amount, updated_at = now()
  where id = p_calculation_id and artisan_id = auth.uid();
  return found;
end $$;

create or replace function public.list_my_pricing_calculations(p_limit integer default 12)
returns table (
  id uuid, product_id uuid, product_name text, title text, material_cost numeric, hours_spent numeric,
  hourly_rate numeric, extra_cost numeric, operational_cost numeric, margin_percent numeric,
  platform_fee_percent numeric, labor_cost numeric, production_cost numeric, desired_profit numeric,
  platform_fee_amount numeric, suggested_price numeric, payment_method text, payment_fee_percent numeric,
  payment_fee_amount numeric, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.product_id, p.name, c.title, c.material_cost, c.hours_spent, c.hourly_rate, c.extra_cost,
    c.operational_cost, c.margin_percent, c.platform_fee_percent, c.labor_cost, c.production_cost,
    c.desired_profit, c.platform_fee_amount, c.suggested_price, c.payment_method, c.payment_fee_percent,
    c.payment_fee_amount, c.created_at
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

commit;
