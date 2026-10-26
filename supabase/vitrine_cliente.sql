-- Execute manualmente no SQL Editor depois dos scripts existentes de profiles e products.
-- Aproveita public.products. NÃO altera cart_items, orders, conversations, messages nem suas funções.
-- Nenhum dado de exemplo é inserido. O script pode ser repetido.
create extension if not exists pgcrypto;

-- Se a versão antiga do script foi executada, não migre favoritos silenciosamente
-- de storefront_products para products: os IDs podem ser diferentes.
do $$
begin
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.storefront_favorites')
      and c.confrelid = to_regclass('public.storefront_products')
      and c.contype = 'f'
  ) then
    raise exception 'Favoritos ainda apontam para storefront_products. Pare e migre esses dados antes de executar a nova vitrine.';
  end if;
end;
$$;

create table if not exists public.storefront_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.storefront_collections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.storefront_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  collection_id uuid references public.storefront_collections(id) on delete set null,
  sort_order integer not null default 0,
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint storefront_banner_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- Somente amplia a tabela products existente. Não recria nem apaga produtos.
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists category_id uuid references public.storefront_categories(id) on delete set null;
alter table public.products add column if not exists collection_id uuid references public.storefront_collections(id) on delete set null;
alter table public.products add column if not exists stock integer check (stock >= 0);
alter table public.products add column if not exists ready_to_ship boolean not null default false;
alter table public.products add column if not exists featured boolean not null default false;
alter table public.products add column if not exists updated_at timestamptz not null default now();
create index if not exists products_storefront_public_idx on public.products (active, created_at desc);
create index if not exists products_storefront_category_idx on public.products (category_id) where active;

-- Favoritos são a única tabela individual nova. O carrinho continua com seu sócio.
create table if not exists public.storefront_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.storefront_categories enable row level security;
alter table public.storefront_collections enable row level security;
alter table public.storefront_banners enable row level security;
alter table public.storefront_favorites enable row level security;

drop policy if exists "Public active categories" on public.storefront_categories;
create policy "Public active categories" on public.storefront_categories for select to anon, authenticated using (active);
drop policy if exists "Public active collections" on public.storefront_collections;
create policy "Public active collections" on public.storefront_collections for select to anon, authenticated using (active);
drop policy if exists "Public current banners" on public.storefront_banners;
create policy "Public current banners" on public.storefront_banners for select to anon, authenticated using (
  active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
);

-- Usa a aprovação que já existe em profiles, sem abrir CPF, telefone ou e-mail ao público.
create or replace function public.is_public_artisan(candidate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = candidate_id and p.account_type = 'artisan' and p.approval_status = 'active'
  );
$$;
revoke all on function public.is_public_artisan(uuid) from public;
grant execute on function public.is_public_artisan(uuid) to anon, authenticated;

drop policy if exists "Own favorites read" on public.storefront_favorites;
create policy "Own favorites read" on public.storefront_favorites for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Own favorites insert" on public.storefront_favorites;
create policy "Own favorites insert" on public.storefront_favorites for insert to authenticated
  with check (auth.uid() = user_id and exists (
    select 1 from public.products p where p.id = product_id and p.active and public.is_public_artisan(p.artisan_id)
  ));
drop policy if exists "Own favorites delete" on public.storefront_favorites;
create policy "Own favorites delete" on public.storefront_favorites for delete to authenticated using (auth.uid() = user_id);

-- Devolve apenas dados públicos das lojas aprovadas.
create or replace function public.list_storefront_shops(p_limit integer default 8)
returns table (id uuid, store_name text, specialty text, story text, city text, state text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.store_name, p.specialty, p.story, p.city, p.state
  from public.profiles p
  where p.account_type = 'artisan' and p.approval_status = 'active' and nullif(trim(p.store_name), '') is not null
  order by p.created_at desc limit least(greatest(coalesce(p_limit, 8), 1), 24);
$$;
revoke all on function public.list_storefront_shops(integer) from public;
grant execute on function public.list_storefront_shops(integer) to anon, authenticated;

-- Busca pública nos produtos REAIS existentes, sem expor dados privados da artesã.
create or replace function public.search_storefront_products(
  p_query text default null,
  p_category_id uuid default null,
  p_collection_id uuid default null,
  p_section text default 'all',
  p_limit integer default 12
)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, collection_id uuid, category_name text, shop_name text
)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock,
    pr.ready_to_ship, pr.featured, pr.created_at, pr.category_id, pr.collection_id,
    cat.name as category_name, art.store_name as shop_name
  from public.products pr
  join public.profiles art on art.id = pr.artisan_id
  left join public.storefront_categories cat on cat.id = pr.category_id
  where pr.active and art.account_type = 'artisan' and art.approval_status = 'active'
    and (p_category_id is null or pr.category_id = p_category_id)
    and (p_collection_id is null or pr.collection_id = p_collection_id)
    and (p_section <> 'featured' or pr.featured)
    and (p_section <> 'ready' or (pr.ready_to_ship and pr.stock > 0))
    and (nullif(trim(p_query), '') is null or
      pr.name ilike '%' || trim(p_query) || '%' or
      coalesce(pr.description, '') ilike '%' || trim(p_query) || '%' or
      coalesce(cat.name, '') ilike '%' || trim(p_query) || '%' or
      coalesce(art.store_name, '') ilike '%' || trim(p_query) || '%')
  order by case when p_section = 'featured' then pr.featured end desc, pr.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 40);
$$;
revoke all on function public.search_storefront_products(text, uuid, uuid, text, integer) from public;
grant execute on function public.search_storefront_products(text, uuid, uuid, text, integer) to anon, authenticated;

grant select on public.storefront_categories, public.storefront_collections, public.storefront_banners to anon, authenticated;
grant select, insert, delete on public.storefront_favorites to authenticated;
