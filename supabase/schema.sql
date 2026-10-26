-- Execute manualmente no SQL Editor do seu projeto Supabase.
create type public.account_type as enum ('client', 'artisan');
create type public.approval_status as enum ('active', 'pending_review', 'assisted_review');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type public.account_type not null,
  approval_status public.approval_status not null,
  full_name text not null,
  email text not null unique,
  document text not null unique,
  phone text not null,
  cep text not null,
  address text not null,
  address_number text not null,
  city text not null,
  state text not null,
  store_name text,
  specialty text,
  story text,
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can read their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own contact data" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, specialty, story, terms_accepted_at)
  values (new.id, (new.raw_user_meta_data->>'account_type')::public.account_type, (new.raw_user_meta_data->>'approval_status')::public.approval_status, new.raw_user_meta_data->>'full_name', new.email, new.raw_user_meta_data->>'document', new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'cep', new.raw_user_meta_data->>'address', new.raw_user_meta_data->>'address_number', new.raw_user_meta_data->>'city', new.raw_user_meta_data->>'state', new.raw_user_meta_data->>'store_name', new.raw_user_meta_data->>'specialty', new.raw_user_meta_data->>'story', (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
