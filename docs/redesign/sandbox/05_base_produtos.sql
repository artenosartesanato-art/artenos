-- SANDBOX LOCAL: reconstrução mínima das tabelas que não estão versionadas no repositório
-- (products e cart_items). Somente para auditoria visual local.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price > 0),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "Artisan reads own products" on public.products for select to authenticated using (auth.uid() = artisan_id);
-- Inferido: a policy de insert de storefront_favorites (supabase/vitrine_cliente.sql)
-- confere a peça com EXISTS em products; isso só funciona se quem compra
-- consegue ler peças ativas de lojas públicas.
create policy "Public reads active products" on public.products for select to anon, authenticated
  using (active and public.is_public_artisan(artisan_id));
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, product_id)
);
alter table public.cart_items enable row level security;
create policy "Own cart" on public.cart_items for select to authenticated using (auth.uid() = client_id);
create or replace function public.remove_from_cart(p_item_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.cart_items where id = p_item_id and client_id = auth.uid();
$$;
grant execute on function public.remove_from_cart(uuid) to authenticated;
