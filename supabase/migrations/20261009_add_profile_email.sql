-- Execute este arquivo uma única vez no SQL Editor se a tabela profiles já existe.
alter table public.profiles add column if not exists email text;

update public.profiles as profiles
set email = users.email
from auth.users as users
where profiles.id = users.id
  and profiles.email is null;

alter table public.profiles alter column email set not null;
create unique index if not exists profiles_email_key on public.profiles (email);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, specialty, story, terms_accepted_at)
  values (new.id, (new.raw_user_meta_data->>'account_type')::public.account_type, (new.raw_user_meta_data->>'approval_status')::public.approval_status, new.raw_user_meta_data->>'full_name', new.email, new.raw_user_meta_data->>'document', new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'cep', new.raw_user_meta_data->>'address', new.raw_user_meta_data->>'address_number', new.raw_user_meta_data->>'city', new.raw_user_meta_data->>'state', new.raw_user_meta_data->>'store_name', new.raw_user_meta_data->>'specialty', new.raw_user_meta_data->>'story', (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz);
  return new;
end;
$$;
