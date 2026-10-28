-- SANDBOX LOCAL: reconstrução das RPCs chamadas pelo front que não estão versionadas.
-- O comportamento foi inferido do uso no código; não é a implementação de produção.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artenos-store-assets','artenos-store-assets',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "sandbox store assets write" on storage.objects;
create policy "sandbox store assets write" on storage.objects for insert to authenticated
  with check (bucket_id = 'artenos-store-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "sandbox store assets delete" on storage.objects;
create policy "sandbox store assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'artenos-store-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "sandbox store assets read" on storage.objects;
create policy "sandbox store assets read" on storage.objects for select using (bucket_id = 'artenos-store-assets');

create or replace function public.list_storefront_categories_with_products()
returns table (id uuid, name text, slug text, image_url text, product_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.slug, c.image_url,
    (select count(*) from public.products p where p.category_id = c.id and p.active and public.is_public_artisan(p.artisan_id))
  from public.storefront_categories c where c.active order by c.sort_order, c.name;
$$;
grant execute on function public.list_storefront_categories_with_products() to anon, authenticated;

create or replace function public.get_public_artisan_store(p_artisan_id uuid)
returns table (artisan_id uuid, store_name text, specialty text, story text, city text, state text,
  announcement text, production_time_days integer, accepts_custom_orders boolean, vacation_mode boolean,
  cover_path text, published_products bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.store_name, p.specialty, p.story, p.city, p.state, s.announcement,
    coalesce(s.production_time_days, 7), coalesce(s.accepts_custom_orders, true), coalesce(s.vacation_mode, false),
    s.cover_path, (select count(*) from public.products pr where pr.artisan_id = p.id and pr.active)
  from public.profiles p left join public.artisan_store_settings s on s.artisan_id = p.id
  where p.id = p_artisan_id and public.is_public_artisan(p.id);
$$;
grant execute on function public.get_public_artisan_store(uuid) to anon, authenticated;

create or replace function public.list_public_artisan_products(p_artisan_id uuid, p_limit integer default 48, p_offset integer default 0)
returns table (id uuid, name text, description text, price numeric, image_url text, stock integer,
  ready_to_ship boolean, category_name text)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock, pr.ready_to_ship, c.name
  from public.products pr left join public.storefront_categories c on c.id = pr.category_id
  where pr.artisan_id = p_artisan_id and pr.active and public.is_public_artisan(pr.artisan_id)
  order by pr.created_at desc limit least(coalesce(p_limit,48),100) offset greatest(coalesce(p_offset,0),0);
$$;
grant execute on function public.list_public_artisan_products(uuid, integer, integer) to anon, authenticated;

create or replace function public.list_my_favorite_products(p_query text default null, p_limit integer default 100, p_offset integer default 0)
returns table (id uuid, name text, description text, price numeric, image_url text, stock integer,
  ready_to_ship boolean, category_name text, shop_name text, favorite_created_at timestamptz, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock, pr.ready_to_ship, c.name,
    a.store_name, f.created_at, count(*) over()
  from public.storefront_favorites f
  join public.products pr on pr.id = f.product_id
  join public.profiles a on a.id = pr.artisan_id
  left join public.storefront_categories c on c.id = pr.category_id
  where f.user_id = auth.uid() and (nullif(trim(p_query),'') is null or pr.name ilike '%'||trim(p_query)||'%')
  order by f.created_at desc limit least(coalesce(p_limit,100),100) offset greatest(coalesce(p_offset,0),0);
$$;
grant execute on function public.list_my_favorite_products(text, integer, integer) to authenticated;

create or replace function public.list_my_orders()
returns table (id uuid, order_code text, client_id uuid, artisan_id uuid, my_role text, status text,
  payment_status text, product_name text, subtotal numeric, shipping_amount numeric, total_amount numeric,
  platform_fee_percent numeric, platform_fee_amount numeric, artisan_net_amount numeric,
  recipient_name text, shipping_cep text, shipping_address text, shipping_number text, shipping_complement text,
  shipping_city text, shipping_state text, carrier text, tracking_code text, tracking_url text,
  estimated_delivery_date date, invoice_number text, invoice_url text, created_at timestamptz,
  updated_at timestamptz, shipped_at timestamptz, delivered_at timestamptz, client_name text,
  artisan_name text, items jsonb, history jsonb)
language sql stable security definer set search_path = '' as $$
  select o.id, o.order_code, o.client_id, o.artisan_id,
    case when o.client_id = auth.uid() then 'client' else 'artisan' end,
    o.status, o.payment_status, o.product_name, o.subtotal, o.shipping_amount, o.total_amount,
    o.platform_fee_percent, o.platform_fee_amount, o.artisan_net_amount,
    o.recipient_name, o.shipping_cep, o.shipping_address, o.shipping_number, o.shipping_complement,
    o.shipping_city, o.shipping_state, o.carrier, o.tracking_code, o.tracking_url,
    o.estimated_delivery_date, o.invoice_number, o.invoice_url, o.created_at, o.updated_at,
    o.shipped_at, o.delivered_at, c.full_name, coalesce(a.store_name, a.full_name),
    coalesce((select jsonb_agg(to_jsonb(i) - 'order_id') from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'status',h.status,'description',h.description,'created_at',h.created_at) order by h.created_at)
      from public.order_status_history h where h.order_id = o.id), '[]'::jsonb)
  from public.orders o join public.profiles c on c.id = o.client_id join public.profiles a on a.id = o.artisan_id
  where auth.uid() in (o.client_id, o.artisan_id) order by o.created_at desc;
$$;
grant execute on function public.list_my_orders() to authenticated;

create or replace function public.update_order_fulfillment(p_order_id uuid, p_status text, p_note text default null,
  p_tracking_code text default null, p_tracking_url text default null, p_carrier text default null,
  p_estimated_delivery_date date default null, p_invoice_number text default null, p_invoice_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set status = p_status, tracking_code = coalesce(p_tracking_code, tracking_code),
    tracking_url = coalesce(p_tracking_url, tracking_url), carrier = coalesce(p_carrier, carrier),
    estimated_delivery_date = coalesce(p_estimated_delivery_date, estimated_delivery_date),
    invoice_number = coalesce(p_invoice_number, invoice_number), invoice_url = coalesce(p_invoice_url, invoice_url),
    shipped_at = case when p_status = 'shipped' then now() else shipped_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end, updated_at = now()
  where id = p_order_id and artisan_id = auth.uid();
  if not found then raise exception 'Venda não encontrada'; end if;
  insert into public.order_status_history(order_id, status, description) values (p_order_id, p_status, p_note);
end; $$;
grant execute on function public.update_order_fulfillment(uuid,text,text,text,text,text,date,text,text) to authenticated;

create or replace function public.get_my_store_overview()
returns table (total_products bigint, published_products bigint, paused_products bigint,
  out_of_stock_products bigint, ready_to_ship_products bigint, favorite_count bigint)
language sql stable security definer set search_path = '' as $$
  select count(*), count(*) filter (where active), count(*) filter (where not active),
    count(*) filter (where stock = 0), count(*) filter (where ready_to_ship),
    (select count(*) from public.storefront_favorites f join public.products p on p.id = f.product_id where p.artisan_id = auth.uid())
  from public.products where artisan_id = auth.uid();
$$;
grant execute on function public.get_my_store_overview() to authenticated;

create or replace function public.list_my_product_catalog(p_query text default null, p_status text default 'all', p_limit integer default 100)
returns table (id uuid, name text, description text, price numeric, image_url text, category_id uuid,
  category_name text, stock integer, ready_to_ship boolean, active boolean, featured boolean,
  created_at timestamptz, updated_at timestamptz, shipping_weight_grams integer, shipping_height_cm numeric,
  shipping_width_cm numeric, shipping_length_cm numeric, shipping_package_count integer,
  production_time_days integer, shipping_data_complete boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, coalesce(p.description,''), p.price, p.image_url, p.category_id, c.name, coalesce(p.stock,0),
    p.ready_to_ship, p.active, p.featured, p.created_at, p.updated_at, p.shipping_weight_grams,
    p.shipping_height_cm, p.shipping_width_cm, p.shipping_length_cm, p.shipping_package_count,
    p.production_time_days,
    (p.shipping_weight_grams is not null and p.shipping_height_cm is not null and p.shipping_width_cm is not null
      and p.shipping_length_cm is not null and p.shipping_package_count is not null and p.production_time_days is not null)
  from public.products p left join public.storefront_categories c on c.id = p.category_id
  where p.artisan_id = auth.uid()
    and (nullif(trim(p_query),'') is null or p.name ilike '%'||trim(p_query)||'%')
    and (coalesce(p_status,'all') = 'all' or (p_status = 'active' and p.active) or (p_status in ('paused','inactive','draft') and not p.active)
      or (p_status = 'out_of_stock' and p.stock = 0))
  order by p.created_at desc limit least(coalesce(p_limit,100),200);
$$;
grant execute on function public.list_my_product_catalog(text, text, integer) to authenticated;

create or replace function public.create_my_product(p_product_id uuid, p_name text, p_description text, p_price numeric,
  p_category_id uuid, p_stock integer, p_ready_to_ship boolean, p_image_url text, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_public_artisan(auth.uid()) then raise exception 'Apenas artesãs aprovadas podem cadastrar produtos'; end if;
  insert into public.products(id, artisan_id, name, description, price, category_id, stock, ready_to_ship, image_url, active)
  values (coalesce(p_product_id, gen_random_uuid()), auth.uid(), p_name, p_description, p_price, p_category_id, p_stock, p_ready_to_ship, p_image_url, p_active);
  return p_product_id;
end; $$;
grant execute on function public.create_my_product(uuid,text,text,numeric,uuid,integer,boolean,text,boolean) to authenticated;

create or replace function public.update_my_product(p_product_id uuid, p_name text, p_description text, p_price numeric,
  p_category_id uuid, p_stock integer, p_ready_to_ship boolean, p_image_url text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.products set name = p_name, description = p_description, price = p_price, category_id = p_category_id,
    stock = p_stock, ready_to_ship = p_ready_to_ship, image_url = p_image_url, active = p_active, updated_at = now()
  where id = p_product_id and artisan_id = auth.uid();
  if not found then raise exception 'Produto não encontrado'; end if;
end; $$;
grant execute on function public.update_my_product(uuid,text,text,numeric,uuid,integer,boolean,text,boolean) to authenticated;

create or replace function public.set_my_product_active(p_product_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.products set active = p_active, updated_at = now() where id = p_product_id and artisan_id = auth.uid();
  if not found then raise exception 'Produto não encontrado'; end if;
end; $$;
grant execute on function public.set_my_product_active(uuid, boolean) to authenticated;

create or replace function public.get_my_artisan_store()
returns table (artisan_id uuid, full_name text, email text, store_name text, specialty text, story text,
  city text, state text, announcement text, production_time_days integer, accepts_custom_orders boolean,
  vacation_mode boolean, cover_path text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.email, coalesce(p.store_name,''), coalesce(p.specialty,''), coalesce(p.story,''),
    p.city, p.state, s.announcement, coalesce(s.production_time_days,7), coalesce(s.accepts_custom_orders,true),
    coalesce(s.vacation_mode,false), s.cover_path, coalesce(s.updated_at, p.updated_at)
  from public.profiles p left join public.artisan_store_settings s on s.artisan_id = p.id where p.id = auth.uid();
$$;
grant execute on function public.get_my_artisan_store() to authenticated;

create or replace function public.update_my_artisan_store(p_store_name text, p_specialty text, p_story text,
  p_announcement text, p_production_time_days integer, p_accepts_custom_orders boolean, p_vacation_mode boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set store_name = p_store_name, specialty = p_specialty, story = p_story, updated_at = now() where id = auth.uid();
  insert into public.artisan_store_settings(artisan_id, announcement, production_time_days, accepts_custom_orders, vacation_mode)
  values (auth.uid(), p_announcement, p_production_time_days, p_accepts_custom_orders, p_vacation_mode)
  on conflict (artisan_id) do update set announcement = excluded.announcement, production_time_days = excluded.production_time_days,
    accepts_custom_orders = excluded.accepts_custom_orders, vacation_mode = excluded.vacation_mode, updated_at = now();
end; $$;
grant execute on function public.update_my_artisan_store(text,text,text,text,integer,boolean,boolean) to authenticated;

create or replace function public.set_my_store_cover(p_cover_path text)
returns void language sql security definer set search_path = '' as $$
  insert into public.artisan_store_settings(artisan_id, cover_path) values (auth.uid(), p_cover_path)
  on conflict (artisan_id) do update set cover_path = excluded.cover_path, updated_at = now();
$$;
grant execute on function public.set_my_store_cover(text) to authenticated;

create or replace function public.list_my_store_products(p_limit integer default 6)
returns table (id uuid, name text, price numeric, image_url text, stock integer, ready_to_ship boolean, active boolean, category_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.price, p.image_url, p.stock, p.ready_to_ship, p.active, c.name
  from public.products p left join public.storefront_categories c on c.id = p.category_id
  where p.artisan_id = auth.uid() order by p.updated_at desc limit least(coalesce(p_limit,6),50);
$$;
grant execute on function public.list_my_store_products(integer) to authenticated;

-- Sob encomenda
create table if not exists public.custom_order_services (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, description text not null, image_url text,
  starting_price numeric(10,2), min_production_days integer not null default 7, max_production_days integer not null default 30,
  category_id uuid references public.storefront_categories(id) on delete set null,
  active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.custom_order_services enable row level security;
drop policy if exists "own services" on public.custom_order_services;
create policy "own services" on public.custom_order_services for all to authenticated using (auth.uid() = artisan_id) with check (auth.uid() = artisan_id);
grant select, insert, update on public.custom_order_services to authenticated;

create table if not exists public.custom_order_requests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.custom_order_services(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, description text not null, quantity integer not null default 1,
  budget numeric(10,2), desired_date date, status text not null default 'pending',
  proposed_price numeric(10,2), response_message text, estimated_delivery_date date,
  created_at timestamptz not null default now()
);
alter table public.custom_order_requests enable row level security;

create or replace function public.list_custom_order_services(p_query text default null, p_category_id uuid default null, p_limit integer default 48, p_offset integer default 0)
returns table (id uuid, artisan_id uuid, title text, description text, image_url text, starting_price numeric,
  min_production_days integer, max_production_days integer, category_id uuid, category_name text,
  store_name text, city text, state text, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select s.id, s.artisan_id, s.title, s.description, s.image_url, s.starting_price, s.min_production_days,
    s.max_production_days, s.category_id, c.name, a.store_name, a.city, a.state, count(*) over()
  from public.custom_order_services s join public.profiles a on a.id = s.artisan_id
  left join public.storefront_categories c on c.id = s.category_id
  left join public.artisan_store_settings st on st.artisan_id = a.id
  where s.active and public.is_public_artisan(a.id) and coalesce(st.accepts_custom_orders,true) and not coalesce(st.vacation_mode,false)
    and (p_category_id is null or s.category_id = p_category_id)
    and (nullif(trim(p_query),'') is null or s.title ilike '%'||trim(p_query)||'%' or s.description ilike '%'||trim(p_query)||'%')
  order by s.created_at desc limit least(coalesce(p_limit,48),48) offset greatest(coalesce(p_offset,0),0);
$$;
grant execute on function public.list_custom_order_services(text, uuid, integer, integer) to anon, authenticated;

create or replace function public.create_custom_order_request(p_service_id uuid, p_title text, p_description text,
  p_quantity integer, p_budget numeric, p_desired_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_artisan uuid; v_id uuid;
begin
  select artisan_id into v_artisan from public.custom_order_services where id = p_service_id and active;
  if v_artisan is null then raise exception 'Opção indisponível'; end if;
  if v_artisan = auth.uid() then raise exception 'Você não pode encomendar da própria loja'; end if;
  insert into public.custom_order_requests(service_id, client_id, artisan_id, title, description, quantity, budget, desired_date)
  values (p_service_id, auth.uid(), v_artisan, p_title, p_description, p_quantity, p_budget, p_desired_date) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.create_custom_order_request(uuid,text,text,integer,numeric,date) to authenticated;

create or replace function public.cancel_custom_order_request(p_request_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.custom_order_requests set status = 'cancelled' where id = p_request_id and client_id = auth.uid() and status = 'pending';
$$;
grant execute on function public.cancel_custom_order_request(uuid) to authenticated;

create or replace function public.list_my_custom_order_requests()
returns table (id uuid, service_id uuid, title text, description text, quantity integer, budget numeric,
  desired_date date, status text, proposed_price numeric, response_message text, estimated_delivery_date date,
  created_at timestamptz, service_title text, client_name text, artisan_name text, my_role text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.service_id, r.title, r.description, r.quantity, r.budget, r.desired_date, r.status,
    r.proposed_price, r.response_message, r.estimated_delivery_date, r.created_at, s.title, c.full_name,
    coalesce(a.store_name, a.full_name), case when r.client_id = auth.uid() then 'client' else 'artisan' end
  from public.custom_order_requests r join public.custom_order_services s on s.id = r.service_id
  join public.profiles c on c.id = r.client_id join public.profiles a on a.id = r.artisan_id
  where auth.uid() in (r.client_id, r.artisan_id) order by r.created_at desc;
$$;
grant execute on function public.list_my_custom_order_requests() to authenticated;

create or replace function public.respond_custom_order_request(p_request_id uuid, p_action text, p_proposed_price numeric,
  p_response_message text, p_estimated_delivery_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.custom_order_requests set status = p_action, proposed_price = p_proposed_price,
    response_message = p_response_message, estimated_delivery_date = p_estimated_delivery_date
  where id = p_request_id and artisan_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Solicitação não encontrada'; end if;
end; $$;
grant execute on function public.respond_custom_order_request(uuid,text,numeric,text,date) to authenticated;

alter table public.conversations alter column order_id drop not null;
alter table public.conversations add column if not exists custom_request_id uuid unique references public.custom_order_requests(id) on delete cascade;
create or replace function public.open_custom_order_conversation(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.custom_order_requests; v_id uuid;
begin
  select * into r from public.custom_order_requests where id = p_request_id and auth.uid() in (client_id, artisan_id);
  if not found then raise exception 'Solicitação não encontrada'; end if;
  insert into public.conversations(client_id, artisan_id, custom_request_id) values (r.client_id, r.artisan_id, r.id)
  on conflict (custom_request_id) do update set last_message_at = public.conversations.last_message_at returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.open_custom_order_conversation(uuid) to authenticated;

commit;
