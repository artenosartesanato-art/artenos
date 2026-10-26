-- Artenós: permite editar um cálculo de precificação já salvo.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase,
-- depois de calculadora_precificacao.sql e tarifa_plataforma.sql.

begin;

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
    select 1
    from public.profiles profile
    where profile.id = current_user_id
      and profile.account_type = 'artisan'::public.account_type
      and profile.approval_status = 'active'::public.approval_status
  ) then
    raise exception 'Apenas artesãs aprovadas podem editar cálculos';
  end if;

  if p_calculation_id is null or not exists (
    select 1
    from public.artisan_pricing_calculations calculation
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
  production := round(
    p_material_cost + labor + p_extra_cost + p_operational_cost,
    2
  );
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

revoke all on function public.update_my_pricing_calculation(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid
) from public, anon;

grant execute on function public.update_my_pricing_calculation(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid
) to authenticated;

commit;

-- Conferência opcional, sem modificar dados:
-- select id, title, suggested_price, created_at, updated_at
-- from public.artisan_pricing_calculations
-- order by updated_at desc;
