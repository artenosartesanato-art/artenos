-- Artenós: etapa 3 - dados logísticos necessários para cálculo de frete.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase.
-- Não altera preço, estoque, pedidos nem a situação de produtos existentes.

begin;

alter table public.artisan_store_settings
  add column if not exists shipping_origin_cep text;

alter table public.products
  add column if not exists shipping_weight_grams integer,
  add column if not exists shipping_height_cm numeric(8,2),
  add column if not exists shipping_width_cm numeric(8,2),
  add column if not exists shipping_length_cm numeric(8,2),
  add column if not exists shipping_package_count integer,
  add column if not exists production_time_days integer;

-- Usa o CEP já validado no cadastro apenas como origem inicial.
-- A artesã poderá informar um CEP logístico diferente em Minha loja.
update public.artisan_store_settings setting
set shipping_origin_cep = regexp_replace(profile.cep, '\D', '', 'g')
from public.profiles profile
where profile.id = setting.artisan_id
  and setting.shipping_origin_cep is null
  and char_length(regexp_replace(profile.cep, '\D', '', 'g')) = 8;

-- Reaproveita o prazo médio já existente para produtos antigos.
-- Produtos prontos para envio não têm prazo de produção.
update public.products product
set production_time_days = case
  when product.ready_to_ship then 0
  else least(greatest(coalesce(setting.production_time_days, 7), 0), 180)
end
from public.artisan_store_settings setting
where setting.artisan_id = product.artisan_id
  and product.production_time_days is null;

-- Integridade também no nível da tabela. Os CHECKs aceitam nulo para manter
-- produtos antigos funcionando até que a artesã complete os dados de frete.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'artisan_store_settings_shipping_origin_cep_check'
      and conrelid = 'public.artisan_store_settings'::regclass
  ) then
    alter table public.artisan_store_settings
      add constraint artisan_store_settings_shipping_origin_cep_check
      check (shipping_origin_cep is null or shipping_origin_cep ~ '^[0-9]{8}$');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'products_shipping_weight_grams_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_shipping_weight_grams_check
      check (shipping_weight_grams is null or shipping_weight_grams between 1 and 30000);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'products_shipping_height_cm_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_shipping_height_cm_check
      check (shipping_height_cm is null or shipping_height_cm between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'products_shipping_width_cm_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_shipping_width_cm_check
      check (shipping_width_cm is null or shipping_width_cm between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'products_shipping_length_cm_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_shipping_length_cm_check
      check (shipping_length_cm is null or shipping_length_cm between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'products_shipping_package_count_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_shipping_package_count_check
      check (shipping_package_count is null or shipping_package_count between 1 and 20);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'products_production_time_days_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_production_time_days_check
      check (production_time_days is null or production_time_days between 0 and 180);
  end if;
end;
$$;

create or replace function public.get_my_shipping_origin()
returns table (
  shipping_origin_cep text,
  inherited_from_profile boolean,
  default_production_time_days integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(profile.cep, '\D', '', 'g')
    ) as shipping_origin_cep,
    setting.shipping_origin_cep is null as inherited_from_profile,
    coalesce(setting.production_time_days, 7) as default_production_time_days
  from public.profiles profile
  left join public.artisan_store_settings setting
    on setting.artisan_id = profile.id
  where profile.id = auth.uid()
    and profile.account_type = 'artisan'::public.account_type;
$$;

create or replace function public.update_my_shipping_origin(p_cep text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_cep text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
begin
  if current_user_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = current_user_id
      and profile.account_type = 'artisan'::public.account_type
      and profile.approval_status = 'active'::public.approval_status
  ) then
    raise exception 'Apenas artesãs aprovadas podem alterar o CEP de origem';
  end if;

  if normalized_cep !~ '^[0-9]{8}$' then
    raise exception 'Informe um CEP de origem com 8 números';
  end if;

  update public.artisan_store_settings
  set shipping_origin_cep = normalized_cep, updated_at = now()
  where artisan_id = current_user_id;

  if not found then
    insert into public.artisan_store_settings (
      artisan_id,
      shipping_origin_cep
    ) values (
      current_user_id,
      normalized_cep
    );
  end if;

  return normalized_cep;
end;
$$;

create or replace function public.list_my_product_shipping_data()
returns table (
  product_id uuid,
  shipping_weight_grams integer,
  shipping_height_cm numeric,
  shipping_width_cm numeric,
  shipping_length_cm numeric,
  shipping_package_count integer,
  production_time_days integer,
  shipping_data_complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    product.id,
    product.shipping_weight_grams,
    product.shipping_height_cm,
    product.shipping_width_cm,
    product.shipping_length_cm,
    product.shipping_package_count,
    product.production_time_days,
    product.shipping_weight_grams is not null
      and product.shipping_height_cm is not null
      and product.shipping_width_cm is not null
      and product.shipping_length_cm is not null
      and product.shipping_package_count is not null
      and product.production_time_days is not null
      as shipping_data_complete
  from public.products product
  where product.artisan_id = auth.uid()
  order by product.created_at desc;
$$;

create or replace function public.save_my_product_shipping_data(
  p_product_id uuid,
  p_weight_grams integer,
  p_height_cm numeric,
  p_width_cm numeric,
  p_length_cm numeric,
  p_package_count integer,
  p_production_time_days integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = current_user_id
      and profile.account_type = 'artisan'::public.account_type
      and profile.approval_status = 'active'::public.approval_status
  ) then
    raise exception 'Apenas artesãs aprovadas podem editar dados de frete';
  end if;

  if p_weight_grams is null or p_weight_grams < 1 or p_weight_grams > 30000 then
    raise exception 'Informe um peso entre 1 e 30000 gramas';
  end if;
  if p_height_cm is null or p_height_cm < 1 or p_height_cm > 200
    or p_width_cm is null or p_width_cm < 1 or p_width_cm > 200
    or p_length_cm is null or p_length_cm < 1 or p_length_cm > 200 then
    raise exception 'As dimensões devem estar entre 1 e 200 centímetros';
  end if;
  if p_package_count is null or p_package_count < 1 or p_package_count > 20 then
    raise exception 'A quantidade de volumes deve estar entre 1 e 20';
  end if;
  if p_production_time_days is null
    or p_production_time_days < 0
    or p_production_time_days > 180 then
    raise exception 'O prazo de produção deve estar entre 0 e 180 dias';
  end if;

  update public.products
  set
    shipping_weight_grams = p_weight_grams,
    shipping_height_cm = round(p_height_cm, 2),
    shipping_width_cm = round(p_width_cm, 2),
    shipping_length_cm = round(p_length_cm, 2),
    shipping_package_count = p_package_count,
    production_time_days = p_production_time_days,
    updated_at = now()
  where id = p_product_id
    and artisan_id = current_user_id;

  if not found then
    raise exception 'Produto não encontrado ou sem permissão para editar';
  end if;

  return true;
end;
$$;

-- Contrato pronto para a próxima etapa de cotação de frete.
-- Expõe somente dados logísticos de produtos publicados e lojas aprovadas.
create or replace function public.get_product_shipping_quote_data(
  p_product_id uuid
)
returns table (
  product_id uuid,
  origin_cep text,
  weight_grams integer,
  height_cm numeric,
  width_cm numeric,
  length_cm numeric,
  package_count integer,
  production_time_days integer,
  shipping_data_complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    product.id,
    coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')
    ),
    product.shipping_weight_grams,
    product.shipping_height_cm,
    product.shipping_width_cm,
    product.shipping_length_cm,
    product.shipping_package_count,
    coalesce(
      product.production_time_days,
      case
        when product.ready_to_ship then 0
        else setting.production_time_days
      end
    ),
    char_length(coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')
    )) = 8
      and product.shipping_weight_grams is not null
      and product.shipping_height_cm is not null
      and product.shipping_width_cm is not null
      and product.shipping_length_cm is not null
      and product.shipping_package_count is not null
      and coalesce(
        product.production_time_days,
        case
          when product.ready_to_ship then 0
          else setting.production_time_days
        end
      ) is not null
  from public.products product
  join public.profiles artisan on artisan.id = product.artisan_id
  left join public.artisan_store_settings setting
    on setting.artisan_id = product.artisan_id
  where product.id = p_product_id
    and product.active
    and artisan.account_type = 'artisan'::public.account_type
    and artisan.approval_status = 'active'::public.approval_status;
$$;

revoke all on function public.get_my_shipping_origin() from public, anon;
revoke all on function public.update_my_shipping_origin(text) from public, anon;
revoke all on function public.list_my_product_shipping_data() from public, anon;
revoke all on function public.save_my_product_shipping_data(uuid, integer, numeric, numeric, numeric, integer, integer) from public, anon;
revoke all on function public.get_product_shipping_quote_data(uuid) from public;

grant execute on function public.get_my_shipping_origin() to authenticated;
grant execute on function public.update_my_shipping_origin(text) to authenticated;
grant execute on function public.list_my_product_shipping_data() to authenticated;
grant execute on function public.save_my_product_shipping_data(uuid, integer, numeric, numeric, numeric, integer, integer) to authenticated;
grant execute on function public.get_product_shipping_quote_data(uuid) to anon, authenticated;

commit;

-- Conferência opcional, sem modificar dados:
-- select artisan_id, shipping_origin_cep from public.artisan_store_settings;
-- select id, name, shipping_weight_grams, shipping_height_cm,
--        shipping_width_cm, shipping_length_cm, shipping_package_count,
--        production_time_days
-- from public.products order by created_at desc;
