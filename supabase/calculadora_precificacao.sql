-- Artenós: calculadora de precificação das artesãs.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase.
-- O script não altera produtos, pedidos, preços ou cálculos já existentes.

begin;

create table if not exists public.platform_pricing_settings (
  id smallint primary key default 1 check (id = 1),
  platform_fee_percent numeric(5,2) not null default 8
    check (platform_fee_percent >= 0 and platform_fee_percent < 100),
  updated_at timestamptz not null default now()
);

insert into public.platform_pricing_settings (id, platform_fee_percent)
values (1, 8)
on conflict (id) do nothing;

create table if not exists public.artisan_pricing_calculations (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  material_cost numeric(12,2) not null check (material_cost >= 0),
  hours_spent numeric(10,2) not null check (hours_spent >= 0),
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  extra_cost numeric(12,2) not null check (extra_cost >= 0),
  operational_cost numeric(12,2) not null check (operational_cost >= 0),
  margin_percent numeric(6,2) not null check (margin_percent >= 0 and margin_percent <= 1000),
  platform_fee_percent numeric(5,2) not null check (platform_fee_percent >= 0 and platform_fee_percent <= 100),
  labor_cost numeric(12,2) not null check (labor_cost >= 0),
  production_cost numeric(12,2) not null check (production_cost >= 0),
  desired_profit numeric(12,2) not null check (desired_profit >= 0),
  platform_fee_amount numeric(12,2) not null check (platform_fee_amount >= 0),
  suggested_price numeric(12,2) not null check (suggested_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artisan_pricing_calculations_owner_created_idx
  on public.artisan_pricing_calculations (artisan_id, created_at desc);

alter table public.platform_pricing_settings enable row level security;
alter table public.artisan_pricing_calculations enable row level security;

revoke all on public.platform_pricing_settings from public, anon, authenticated;
revoke all on public.artisan_pricing_calculations from public, anon, authenticated;

drop policy if exists "Artisans read own pricing calculations"
  on public.artisan_pricing_calculations;
create policy "Artisans read own pricing calculations"
  on public.artisan_pricing_calculations
  for select to authenticated
  using (artisan_id = auth.uid());

create or replace function public.get_pricing_calculator_settings()
returns table (platform_fee_percent numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select s.platform_fee_percent
  from public.platform_pricing_settings s
  where s.id = 1;
$$;

create or replace function public.list_my_pricing_calculations(
  p_limit integer default 12
)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  title text,
  material_cost numeric,
  hours_spent numeric,
  hourly_rate numeric,
  extra_cost numeric,
  operational_cost numeric,
  margin_percent numeric,
  platform_fee_percent numeric,
  labor_cost numeric,
  production_cost numeric,
  desired_profit numeric,
  platform_fee_amount numeric,
  suggested_price numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.product_id,
    p.name as product_name,
    c.title,
    c.material_cost,
    c.hours_spent,
    c.hourly_rate,
    c.extra_cost,
    c.operational_cost,
    c.margin_percent,
    c.platform_fee_percent,
    c.labor_cost,
    c.production_cost,
    c.desired_profit,
    c.platform_fee_amount,
    c.suggested_price,
    c.created_at
  from public.artisan_pricing_calculations c
  left join public.products p on p.id = c.product_id
  where c.artisan_id = auth.uid()
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

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
    select 1 from public.products product
    where product.id = p_product_id and product.artisan_id = current_user_id
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

create or replace function public.delete_my_pricing_calculation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.artisan_pricing_calculations
  where id = p_id and artisan_id = auth.uid();
  return found;
end;
$$;

create or replace function public.update_my_pricing_calculation(
  p_calculation_id uuid,
  p_title text,
  p_material_cost numeric,
  p_hours_spent numeric,
  p_hourly_rate numeric,
  p_extra_cost numeric,
  p_operational_cost numeric,
  p_margin_percent numeric,
  p_product_id uuid default null
)
returns boolean
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
begin
  if current_user_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and profile.account_type = 'artisan'::public.account_type
      and profile.approval_status = 'active'::public.approval_status
  ) then
    raise exception 'Apenas artesãs aprovadas podem editar cálculos';
  end if;

  if p_calculation_id is null or not exists (
    select 1 from public.artisan_pricing_calculations calculation
    where calculation.id = p_calculation_id
      and calculation.artisan_id = current_user_id
  ) then
    raise exception 'Cálculo não encontrado ou sem permissão para editar';
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
    select 1 from public.products product
    where product.id = p_product_id
      and product.artisan_id = current_user_id
  ) then
    raise exception 'O produto selecionado não pertence à sua loja';
  end if;

  select setting.platform_fee_percent into fee_percent
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

  update public.artisan_pricing_calculations
  set
    product_id = p_product_id,
    title = btrim(p_title),
    material_cost = round(p_material_cost, 2),
    hours_spent = round(p_hours_spent, 2),
    hourly_rate = round(p_hourly_rate, 2),
    extra_cost = round(p_extra_cost, 2),
    operational_cost = round(p_operational_cost, 2),
    margin_percent = round(p_margin_percent, 2),
    platform_fee_percent = fee_percent,
    labor_cost = labor,
    production_cost = production,
    desired_profit = profit,
    platform_fee_amount = fee_amount,
    suggested_price = sale_price,
    updated_at = now()
  where id = p_calculation_id
    and artisan_id = current_user_id;

  return found;
end;
$$;

revoke all on function public.get_pricing_calculator_settings() from public;
revoke all on function public.list_my_pricing_calculations(integer) from public;
revoke all on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid) from public;
revoke all on function public.delete_my_pricing_calculation(uuid) from public;
revoke all on function public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid) from public;

grant execute on function public.get_pricing_calculator_settings() to authenticated;
grant execute on function public.list_my_pricing_calculations(integer) to authenticated;
grant execute on function public.save_pricing_calculation(text, numeric, numeric, numeric, numeric, numeric, numeric, uuid) to authenticated;
grant execute on function public.delete_my_pricing_calculation(uuid) to authenticated;
grant execute on function public.update_my_pricing_calculation(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid) to authenticated;

commit;

-- Conferência opcional, sem alterar dados:
-- select * from public.platform_pricing_settings;
-- select * from public.artisan_pricing_calculations order by created_at desc;
