-- SANDBOX LOCAL: colunas de pedidos, itens, histórico e configurações da loja
-- usadas pelo front e pelas funções de checkout, mas ausentes no repositório.
alter table public.orders
  add column if not exists order_code text,
  add column if not exists status text not null default 'payment_confirmed',
  add column if not exists payment_status text not null default 'paid',
  add column if not exists payment_reference text,
  add column if not exists subtotal numeric(10,2) not null default 0,
  add column if not exists shipping_amount numeric(10,2) not null default 0,
  add column if not exists total_amount numeric(10,2) not null default 0,
  add column if not exists platform_fee_percent numeric(5,2),
  add column if not exists platform_fee_amount numeric(10,2),
  add column if not exists artisan_net_amount numeric(10,2),
  add column if not exists recipient_name text,
  add column if not exists shipping_cep text,
  add column if not exists shipping_address text,
  add column if not exists shipping_number text,
  add column if not exists shipping_complement text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists carrier text,
  add column if not exists tracking_code text,
  add column if not exists tracking_url text,
  add column if not exists estimated_delivery_date date,
  add column if not exists invoice_number text,
  add column if not exists invoice_url text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists shipping_provider text,
  add column if not exists shipping_service_id integer,
  add column if not exists shipping_service_name text,
  add column if not exists shipping_company text,
  add column if not exists shipping_delivery_min_days integer,
  add column if not exists shipping_delivery_max_days integer,
  add column if not exists shipping_production_days integer,
  add column if not exists shipping_quote_id uuid;
create sequence if not exists public.order_code_seq start 1001;
alter table public.orders alter column order_code set default ('AN-' || nextval('public.order_code_seq'));

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  image_url text,
  quantity integer not null,
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null
);
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  description text,
  created_at timestamptz not null default now()
);
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

create table if not exists public.artisan_store_settings (
  artisan_id uuid primary key references public.profiles(id) on delete cascade,
  announcement text,
  production_time_days integer not null default 7,
  accepts_custom_orders boolean not null default true,
  vacation_mode boolean not null default false,
  cover_path text,
  updated_at timestamptz not null default now()
);
alter table public.artisan_store_settings enable row level security;
