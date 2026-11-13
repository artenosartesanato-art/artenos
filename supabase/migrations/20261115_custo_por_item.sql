-- Custo fixo por item (R$ 4,00).
--   * Calculadora de precificação: a loja escolhe (caixa de seleção) se o custo
--     por item entra na conta. Ele é somado ao custo + lucro antes das taxas:
--     preço = (custo + lucro + custo por item) / (1 - (tarifa + taxa de pagamento)/100).
--   * Cadastro da peça (catálogo): com a opção ativada pela administração (tela
--     Tarifa), o custo por item é obrigatório (a caixa fica marcada e a loja não
--     pode retirar). Com a opção desligada, a loja escolhe se soma o custo.
--   * O valor somado fica guardado por peça (product_item_costs): o preço salvo
--     em products/product_variants já inclui o custo, e o cadastro mostra o
--     preço da loja separado ao editar.
-- Nada muda na cobrança: carrinho, checkout e repasse seguem pelo preço da peça.
-- Rode depois de 20261111_taxa_pagamento_calculadora.sql. Pode ser repetida.
begin;

-- 1) Configuração --------------------------------------------------------------
alter table public.platform_pricing_settings
  add column if not exists item_cost_amount numeric(12,2) not null default 4.00
    check (item_cost_amount >= 0 and item_cost_amount <= 1000),
  add column if not exists item_cost_catalog_enabled boolean not null default false;

alter table public.artisan_pricing_calculations
  add column if not exists item_cost_amount numeric(12,2) not null default 0;

-- Custo por item somado ao preço de cada peça (sem linha = peça sem o custo).
create table if not exists public.product_item_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
alter table public.product_item_costs enable row level security;
revoke all on public.product_item_costs from public, anon, authenticated;

-- Leitura para a calculadora, o cadastro da peça e o painel.
create or replace function public.get_item_cost_settings()
returns table (amount numeric, catalog_enabled boolean)
language sql stable security definer set search_path = '' as $$
  select s.item_cost_amount, s.item_cost_catalog_enabled
  from public.platform_pricing_settings s where s.id = 1;
$$;
revoke all on function public.get_item_cost_settings() from public, anon;
grant execute on function public.get_item_cost_settings() to authenticated;

-- Só a proprietária liga ou desliga (como a tarifa da plataforma).
create or replace function public.admin_set_item_cost_catalog_enabled(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid() and a.active and a.role = 'owner') then
    raise exception 'Somente a proprietária pode alterar o custo por item';
  end if;
  if p_enabled is null then raise exception 'Informe se o custo por item fica ativado'; end if;
  update public.platform_pricing_settings
     set item_cost_catalog_enabled = p_enabled, updated_at = now(), updated_by = auth.uid()
   where id = 1;
  return p_enabled;
end $$;
revoke all on function public.admin_set_item_cost_catalog_enabled(boolean) from public, anon;
grant execute on function public.admin_set_item_cost_catalog_enabled(boolean) to authenticated;

-- 2) Custo por item da peça (cadastro no catálogo) --------------------------------
-- Opção ativada pela administração: o custo é obrigatório (não pode retirar).
-- Opção desligada: a loja liga ou retira à vontade.
create or replace function public.set_my_product_item_cost(p_product_id uuid, p_enabled boolean)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_current numeric; v_setting public.platform_pricing_settings;
begin
  if auth.uid() is null or not exists (
    select 1 from public.products pr where pr.id = p_product_id and pr.artisan_id = auth.uid()) then
    raise exception 'Produto não encontrado';
  end if;
  select c.amount into v_current from public.product_item_costs c where c.product_id = p_product_id;
  select * into v_setting from public.platform_pricing_settings where id = 1;
  if not coalesce(p_enabled, false) then
    if coalesce(v_setting.item_cost_catalog_enabled, false) then
      raise exception 'O custo por item é obrigatório pela administração da Artenós';
    end if;
    delete from public.product_item_costs where product_id = p_product_id;
    return 0;
  end if;
  if v_current is not null then return v_current; end if;
  if coalesce(v_setting.item_cost_amount, 0) <= 0 then
    raise exception 'O custo por item não está configurado';
  end if;
  insert into public.product_item_costs (product_id, amount) values (p_product_id, v_setting.item_cost_amount);
  return v_setting.item_cost_amount;
end $$;
revoke all on function public.set_my_product_item_cost(uuid, boolean) from public, anon;
grant execute on function public.set_my_product_item_cost(uuid, boolean) to authenticated;

create or replace function public.list_my_product_item_costs()
returns table (product_id uuid, amount numeric)
language sql stable security definer set search_path = '' as $$
  select c.product_id, c.amount
  from public.product_item_costs c
  join public.products pr on pr.id = c.product_id
  where pr.artisan_id = auth.uid();
$$;
revoke all on function public.list_my_product_item_costs() from public, anon;
grant execute on function public.list_my_product_item_costs() to authenticated;

-- 3) Cálculo único com o custo por item -----------------------------------------
drop function if exists public.pricing_compute(numeric, numeric, numeric, numeric, numeric, numeric, text);

create or replace function public.pricing_compute(
  p_material_cost numeric, p_hours_spent numeric, p_hourly_rate numeric, p_extra_cost numeric,
  p_operational_cost numeric, p_margin_percent numeric, p_payment_method text, p_include_item_cost boolean,
  out fee_percent numeric, out payment_percent numeric, out labor numeric, out production numeric,
  out profit numeric, out item_cost numeric, out sale_price numeric, out fee_amount numeric, out payment_amount numeric)
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
  item_cost := case when coalesce(p_include_item_cost, false) and production > 0
    then coalesce(v_setting.item_cost_amount, 4) else 0 end;
  sale_price := round((production + profit + item_cost) / (1 - (fee_percent + payment_percent) / 100), 2);
  fee_amount := round(sale_price * fee_percent / 100, 2);
  payment_amount := round(sale_price * payment_percent / 100, 2);
end $$;
revoke all on function public.pricing_compute(numeric, numeric, numeric, numeric, numeric, numeric, text, boolean) from public, anon, authenticated;

-- 4) Salvar / editar / listar com o custo por item ---------------------------------
-- A assinatura muda (novo parâmetro): as versões antigas saem para não haver
-- chamadas ambíguas.
drop function if exists public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text);
drop function if exists public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text);
drop function if exists public.list_my_pricing_calculations(integer);

create or replace function public.save_pricing_calculation(
  p_title text, p_material_cost numeric, p_hours_spent numeric, p_hourly_rate numeric, p_extra_cost numeric,
  p_operational_cost numeric, p_margin_percent numeric, p_product_id uuid default null, p_payment_method text default 'card',
  p_include_item_cost boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record; new_id uuid;
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
    p_operational_cost, p_margin_percent, coalesce(p_payment_method, 'card'), coalesce(p_include_item_cost, false));
  insert into public.artisan_pricing_calculations (
    artisan_id, product_id, title, material_cost, hours_spent, hourly_rate, extra_cost, operational_cost,
    margin_percent, platform_fee_percent, labor_cost, production_cost, desired_profit, platform_fee_amount,
    suggested_price, payment_method, payment_fee_percent, payment_fee_amount, item_cost_amount)
  values (auth.uid(), p_product_id, btrim(p_title), round(p_material_cost, 2), round(p_hours_spent, 2),
    round(p_hourly_rate, 2), round(p_extra_cost, 2), round(p_operational_cost, 2), round(p_margin_percent, 2),
    c.fee_percent, c.labor, c.production, c.profit, c.fee_amount, c.sale_price,
    coalesce(p_payment_method, 'card'), c.payment_percent, c.payment_amount, c.item_cost)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.update_my_pricing_calculation(
  p_calculation_id uuid, p_title text, p_material_cost numeric, p_hours_spent numeric, p_hourly_rate numeric,
  p_extra_cost numeric, p_operational_cost numeric, p_margin_percent numeric, p_product_id uuid default null,
  p_payment_method text default 'card', p_include_item_cost boolean default false)
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
    p_operational_cost, p_margin_percent, coalesce(p_payment_method, 'card'), coalesce(p_include_item_cost, false));
  update public.artisan_pricing_calculations set
    product_id = p_product_id, title = btrim(p_title), material_cost = round(p_material_cost, 2),
    hours_spent = round(p_hours_spent, 2), hourly_rate = round(p_hourly_rate, 2), extra_cost = round(p_extra_cost, 2),
    operational_cost = round(p_operational_cost, 2), margin_percent = round(p_margin_percent, 2),
    platform_fee_percent = c.fee_percent, labor_cost = c.labor, production_cost = c.production,
    desired_profit = c.profit, platform_fee_amount = c.fee_amount, suggested_price = c.sale_price,
    payment_method = coalesce(p_payment_method, 'card'), payment_fee_percent = c.payment_percent,
    payment_fee_amount = c.payment_amount, item_cost_amount = c.item_cost, updated_at = now()
  where id = p_calculation_id and artisan_id = auth.uid();
  return found;
end $$;

create or replace function public.list_my_pricing_calculations(p_limit integer default 12)
returns table (
  id uuid, product_id uuid, product_name text, title text, material_cost numeric, hours_spent numeric,
  hourly_rate numeric, extra_cost numeric, operational_cost numeric, margin_percent numeric,
  platform_fee_percent numeric, labor_cost numeric, production_cost numeric, desired_profit numeric,
  platform_fee_amount numeric, suggested_price numeric, payment_method text, payment_fee_percent numeric,
  payment_fee_amount numeric, item_cost_amount numeric, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.product_id, p.name, c.title, c.material_cost, c.hours_spent, c.hourly_rate, c.extra_cost,
    c.operational_cost, c.margin_percent, c.platform_fee_percent, c.labor_cost, c.production_cost,
    c.desired_profit, c.platform_fee_amount, c.suggested_price, c.payment_method, c.payment_fee_percent,
    c.payment_fee_amount, c.item_cost_amount, c.created_at
  from public.artisan_pricing_calculations c
  left join public.products p on p.id = c.product_id
  where c.artisan_id = auth.uid()
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, boolean) from public, anon;
revoke all on function public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, boolean) from public, anon;
revoke all on function public.list_my_pricing_calculations(integer) from public, anon;
grant execute on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, boolean) to authenticated;
grant execute on function public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, boolean) to authenticated;
grant execute on function public.list_my_pricing_calculations(integer) to authenticated;

commit;
