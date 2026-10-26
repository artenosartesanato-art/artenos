-- Artenós: corrige "Database error saving new user" após adicionar o e-mail.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase.

begin;

-- Garante que a coluna exista e recupera o e-mail dos usuários já cadastrados.
alter table public.profiles
  add column if not exists email text;

update public.profiles as profiles
set email = users.email
from auth.users as users
where profiles.id = users.id
  and profiles.email is null;

alter table public.profiles
  alter column email set not null;

create unique index if not exists profiles_email_key
  on public.profiles (email);

-- Permite ao formulário verificar apenas se o documento está disponível.
-- A função não retorna nomes, e-mails ou qualquer outro dado pessoal.
create or replace function public.is_registration_document_available(candidate_document text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where document = regexp_replace(candidate_document, '[^0-9]', '', 'g')
  );
$$;

revoke all on function public.is_registration_document_available(text) from public;
grant execute on function public.is_registration_document_available(text) to anon, authenticated;

-- Substitui a função antiga por uma versão que também grava o e-mail.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    account_type,
    approval_status,
    full_name,
    email,
    document,
    phone,
    cep,
    address,
    address_number,
    city,
    state,
    store_name,
    specialty,
    story,
    terms_accepted_at
  )
  values (
    new.id,
    (new.raw_user_meta_data->>'account_type')::public.account_type,
    (new.raw_user_meta_data->>'approval_status')::public.approval_status,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'document',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'cep',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'address_number',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'state',
    new.raw_user_meta_data->>'store_name',
    new.raw_user_meta_data->>'specialty',
    new.raw_user_meta_data->>'story',
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz
  );

  return new;
end;
$$;

-- Recria o trigger para garantir que ele use a função corrigida.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

commit;
