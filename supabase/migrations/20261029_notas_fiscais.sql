-- Artenós: preparação para nota fiscal por compra.
-- Execute UMA vez depois das demais migrações de 20261029. Pode ser repetido.
--
-- Como funciona:
--   * pedido pago (finalize_checkout, chamado após o webhook do Mercado Pago com
--     assinatura validada) entra na fila invoice_jobs por trigger — um job por
--     pedido (idempotente: nunca duas notas para o mesmo pedido);
--   * a rota /api/cron/notas-fiscais processa a fila com o provedor configurado
--     (INVOICE_PROVIDER), com retentativas e o status em orders.nf_*;
--   * dados fiscais da loja (seller_fiscal_profiles) e da peça (NCM/CFOP) ficam
--     guardados e validados; com invoice_settings.required = true, a loja só
--     publica peças com esses dados completos.

begin;

alter table public.orders
  add column if not exists invoice_number text,
  add column if not exists invoice_url text,
  add column if not exists nf_status text not null default 'nao_aplicavel',
  add column if not exists nf_numero text,
  add column if not exists nf_url_pdf text,
  add column if not exists nf_xml text,
  add column if not exists nf_erro text,
  add column if not exists nf_provider_id text,
  add column if not exists nf_atualizada_em timestamptz;
alter table public.orders drop constraint if exists orders_nf_status_check;
alter table public.orders add constraint orders_nf_status_check
  check (nf_status in ('nao_aplicavel', 'pendente', 'processando', 'emitida', 'aguardando_loja', 'erro', 'cancelada'));

create table if not exists public.invoice_settings (
  id smallint primary key default 1 check (id = 1),
  required boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.invoice_settings(id) values (1) on conflict (id) do nothing;
alter table public.invoice_settings enable row level security;
revoke all on public.invoice_settings from public, anon, authenticated;
grant select on public.invoice_settings to service_role;

create table if not exists public.seller_fiscal_profiles (
  artisan_id uuid primary key references public.profiles(id) on delete cascade,
  person_type text not null check (person_type in ('pf', 'pj')),
  document text not null check (document ~ '^[0-9]{11}$|^[0-9]{14}$'),
  legal_name text not null check (char_length(btrim(legal_name)) between 3 and 150),
  tax_regime text not null check (tax_regime in ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real', 'pessoa_fisica')),
  state_registration text check (state_registration is null or state_registration ~ '^([0-9]{2,14}|ISENTO)$'),
  municipal_registration text check (municipal_registration is null or char_length(municipal_registration) <= 20),
  cep text not null check (cep ~ '^[0-9]{8}$'),
  street text not null,
  number text not null,
  complement text,
  district text not null,
  city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  ibge_city_code text check (ibge_city_code is null or ibge_city_code ~ '^[0-9]{7}$'),
  updated_at timestamptz not null default now(),
  check ((person_type = 'pf' and char_length(document) = 11) or (person_type = 'pj' and char_length(document) = 14))
);
alter table public.seller_fiscal_profiles enable row level security;
revoke all on public.seller_fiscal_profiles from public, anon, authenticated;
grant select on public.seller_fiscal_profiles to service_role;

alter table public.products
  add column if not exists ncm text,
  add column if not exists cfop text,
  add column if not exists fiscal_origin smallint;
alter table public.products drop constraint if exists products_fiscal_check;
alter table public.products add constraint products_fiscal_check check (
  (ncm is null or ncm ~ '^[0-9]{8}$') and (cfop is null or cfop ~ '^[0-9]{4}$')
  and (fiscal_origin is null or fiscal_origin between 0 and 8));

create table if not exists public.invoice_jobs (
  order_id uuid primary key references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoice_jobs_due_idx on public.invoice_jobs (next_attempt_at) where status = 'pending';
alter table public.invoice_jobs enable row level security;
revoke all on public.invoice_jobs from public, anon, authenticated;
grant select, insert, update on public.invoice_jobs to service_role;

-- Pedido pago → entra na fila (uma vez só).
create or replace function public.enqueue_invoice_job()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status = 'paid' and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid') then
    insert into public.invoice_jobs(order_id) values (new.id) on conflict (order_id) do nothing;
    if new.nf_status = 'nao_aplicavel' then
      update public.orders set nf_status = 'pendente', nf_atualizada_em = now() where id = new.id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists enqueue_invoice_job on public.orders;
create trigger enqueue_invoice_job after insert or update of payment_status on public.orders
  for each row execute function public.enqueue_invoice_job();

-- Nota informada pela loja na atualização do pedido (invoice_number/url) marca como emitida.
create or replace function public.sync_manual_invoice()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.invoice_url is not null and new.invoice_url is distinct from old.invoice_url and new.nf_status <> 'emitida' then
    new.nf_status := 'emitida';
    new.nf_numero := coalesce(new.nf_numero, new.invoice_number);
    new.nf_url_pdf := coalesce(new.nf_url_pdf, new.invoice_url);
    new.nf_erro := null;
    new.nf_atualizada_em := now();
  end if;
  return new;
end $$;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'invoice_url') then
    execute 'drop trigger if exists sync_manual_invoice on public.orders';
    execute 'create trigger sync_manual_invoice before update of invoice_url on public.orders
      for each row execute function public.sync_manual_invoice()';
  end if;
end $$;

-- Fila: pega jobs vencidos sem corrida entre execuções.
create or replace function public.claim_invoice_jobs(p_limit integer default 20)
returns setof public.invoice_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.invoice_jobs j set status = 'processing', attempts = j.attempts + 1, updated_at = now()
  where j.order_id in (
    select order_id from public.invoice_jobs
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked)
  returning j.*;
end $$;
revoke all on function public.claim_invoice_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_invoice_jobs(integer) to service_role;

-- Tudo o que a emissão precisa, num JSON só.
create or replace function public.invoice_context(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'code', o.order_code, 'created_at', o.created_at, 'subtotal', o.subtotal,
      'shipping_amount', o.shipping_amount, 'total_amount', o.total_amount, 'payment_reference', o.payment_reference,
      'recipient_name', o.recipient_name, 'shipping_cep', o.shipping_cep, 'shipping_address', o.shipping_address,
      'shipping_number', o.shipping_number, 'shipping_city', o.shipping_city, 'shipping_state', o.shipping_state,
      'nf_status', o.nf_status, 'nf_provider_id', o.nf_provider_id),
    'buyer', jsonb_build_object('name', c.full_name, 'document', c.document, 'email', c.email),
    'seller', (select to_jsonb(f) from public.seller_fiscal_profiles f where f.artisan_id = o.artisan_id),
    'store_name', coalesce(a.store_name, a.full_name),
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', i.product_name,
        'quantity', i.quantity, 'unit_price', i.unit_price, 'subtotal', i.subtotal,
        'ncm', p.ncm, 'cfop', p.cfop, 'origin', p.fiscal_origin) order by i.product_name)
      from public.order_items i left join public.products p on p.id = i.product_id where i.order_id = o.id), '[]'::jsonb))
  from public.orders o join public.profiles c on c.id = o.client_id join public.profiles a on a.id = o.artisan_id
  where o.id = p_order_id;
$$;
revoke all on function public.invoice_context(uuid) from public, anon, authenticated;
grant execute on function public.invoice_context(uuid) to service_role;

-- Resultado de uma tentativa (idempotente: pedido com nota emitida não muda).
create or replace function public.finish_invoice_job(
  p_order_id uuid, p_outcome text, p_number text default null, p_pdf_url text default null,
  p_xml text default null, p_provider_id text default null, p_error text default null, p_max_attempts integer default 5
) returns void language plpgsql security definer set search_path = '' as $$
declare v_job public.invoice_jobs;
begin
  select * into v_job from public.invoice_jobs where order_id = p_order_id for update;
  if not found then return; end if;
  if p_outcome = 'issued' then
    update public.orders set nf_status = 'emitida', nf_numero = p_number, nf_url_pdf = p_pdf_url, nf_xml = p_xml,
      nf_provider_id = p_provider_id, nf_erro = null, nf_atualizada_em = now(),
      -- Campos que o comprador já vê em Pedidos.
      invoice_number = coalesce(invoice_number, p_number), invoice_url = coalesce(invoice_url, p_pdf_url)
      where id = p_order_id and nf_status <> 'emitida';
    update public.invoice_jobs set status = 'done', last_error = null, updated_at = now() where order_id = p_order_id;
  elsif p_outcome = 'processing' then
    -- O emissor recebeu e responde depois (consulta na próxima rodada).
    update public.orders set nf_status = 'processando', nf_provider_id = coalesce(p_provider_id, nf_provider_id), nf_atualizada_em = now()
      where id = p_order_id and nf_status <> 'emitida';
    update public.invoice_jobs set status = 'pending', next_attempt_at = now() + interval '10 minutes', updated_at = now()
      where order_id = p_order_id;
  elsif p_outcome = 'manual' then
    update public.orders set nf_status = 'aguardando_loja', nf_erro = p_error, nf_atualizada_em = now()
      where id = p_order_id and nf_status <> 'emitida';
    update public.invoice_jobs set status = 'done', last_error = p_error, updated_at = now() where order_id = p_order_id;
  else
    update public.orders set nf_status = case when v_job.attempts >= p_max_attempts then 'erro' else 'pendente' end,
      nf_erro = left(p_error, 500), nf_atualizada_em = now()
      where id = p_order_id and nf_status <> 'emitida';
    update public.invoice_jobs set
      status = case when v_job.attempts >= p_max_attempts then 'failed' else 'pending' end,
      next_attempt_at = now() + make_interval(mins => (5 * power(3, least(v_job.attempts, 6)))::integer),
      last_error = left(p_error, 500), updated_at = now()
      where order_id = p_order_id;
  end if;
end $$;
revoke all on function public.finish_invoice_job(uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.finish_invoice_job(uuid, text, text, text, text, text, text, integer) to service_role;

-- Loja: ver e salvar os próprios dados fiscais e o NCM/CFOP das peças.
create or replace function public.get_my_fiscal_profile()
returns setof public.seller_fiscal_profiles language sql stable security definer set search_path = '' as $$
  select * from public.seller_fiscal_profiles where artisan_id = auth.uid();
$$;
revoke all on function public.get_my_fiscal_profile() from public, anon;
grant execute on function public.get_my_fiscal_profile() to authenticated;

create or replace function public.save_my_fiscal_profile(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_public_artisan(auth.uid()) then raise exception 'Somente lojas aprovadas'; end if;
  insert into public.seller_fiscal_profiles(artisan_id, person_type, document, legal_name, tax_regime, state_registration,
    municipal_registration, cep, street, number, complement, district, city, state, ibge_city_code, updated_at)
  values (auth.uid(), p->>'person_type', regexp_replace(coalesce(p->>'document', ''), '\D', '', 'g'), btrim(p->>'legal_name'),
    p->>'tax_regime', nullif(upper(regexp_replace(coalesce(p->>'state_registration', ''), '[^0-9A-Za-z]', '', 'g')), ''),
    nullif(btrim(coalesce(p->>'municipal_registration', '')), ''), regexp_replace(coalesce(p->>'cep', ''), '\D', '', 'g'),
    btrim(p->>'street'), btrim(p->>'number'), nullif(btrim(coalesce(p->>'complement', '')), ''), btrim(p->>'district'),
    btrim(p->>'city'), upper(btrim(p->>'state')), nullif(regexp_replace(coalesce(p->>'ibge_city_code', ''), '\D', '', 'g'), ''), now())
  on conflict (artisan_id) do update set person_type = excluded.person_type, document = excluded.document,
    legal_name = excluded.legal_name, tax_regime = excluded.tax_regime, state_registration = excluded.state_registration,
    municipal_registration = excluded.municipal_registration, cep = excluded.cep, street = excluded.street,
    number = excluded.number, complement = excluded.complement, district = excluded.district, city = excluded.city,
    state = excluded.state, ibge_city_code = excluded.ibge_city_code, updated_at = now();
end $$;
revoke all on function public.save_my_fiscal_profile(jsonb) from public, anon;
grant execute on function public.save_my_fiscal_profile(jsonb) to authenticated;

create or replace function public.list_my_products_fiscal()
returns table (id uuid, name text, active boolean, ncm text, cfop text, fiscal_origin smallint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.active, p.ncm, p.cfop, p.fiscal_origin from public.products p
  where p.artisan_id = auth.uid() order by p.name;
$$;
revoke all on function public.list_my_products_fiscal() from public, anon;
grant execute on function public.list_my_products_fiscal() to authenticated;

create or replace function public.set_my_product_fiscal(p_product_id uuid, p_ncm text, p_cfop text, p_origin integer default 0)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.products set ncm = nullif(regexp_replace(coalesce(p_ncm, ''), '\D', '', 'g'), ''),
    cfop = nullif(regexp_replace(coalesce(p_cfop, ''), '\D', '', 'g'), ''), fiscal_origin = p_origin, updated_at = now()
  where id = p_product_id and artisan_id = auth.uid();
  if not found then raise exception 'Peça não encontrada'; end if;
end $$;
revoke all on function public.set_my_product_fiscal(uuid, text, text, integer) from public, anon;
grant execute on function public.set_my_product_fiscal(uuid, text, text, integer) to authenticated;

-- Com nota obrigatória, só publica peça com dados fiscais completos.
create or replace function public.require_fiscal_data_to_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active and not coalesce((select required from public.invoice_settings where id = 1), false) then return new; end if;
  if new.active and (new.ncm is null or new.cfop is null
     or not exists (select 1 from public.seller_fiscal_profiles f where f.artisan_id = new.artisan_id)) then
    raise exception 'FISCAL: Para publicar, preencha os dados fiscais da loja e o NCM/CFOP da peça em Dados fiscais.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists require_fiscal_data_to_publish on public.products;
create trigger require_fiscal_data_to_publish before insert or update of active, ncm, cfop on public.products
  for each row execute function public.require_fiscal_data_to_publish();

commit;
