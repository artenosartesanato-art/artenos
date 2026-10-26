-- Artenós: primeira etapa da segurança de aprovação de artesãos.
-- Execute TODO este arquivo uma única vez no SQL Editor do Supabase.
-- Ele não aprova, rejeita ou altera o status dos cadastros já existentes.

begin;

-- Garante compatibilidade com a edição atual do perfil.
alter table public.profiles add column if not exists avatar_path text;

-- O próprio usuário só pode editar dados pessoais e comerciais comuns.
-- Tipo de conta, aprovação, documento, e-mail e datas ficam fora do grant.
revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant update (
  full_name,
  phone,
  cep,
  address,
  address_number,
  city,
  state,
  store_name,
  specialty,
  story,
  avatar_path,
  updated_at
) on public.profiles to authenticated;

-- Defesa adicional: mesmo que um grant seja ampliado por engano no futuro,
-- o dono do perfil não poderá alterar campos usados para autorização.
create or replace function public.protect_profile_approval_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = old.id and (
    new.id is distinct from old.id or
    new.account_type is distinct from old.account_type or
    new.approval_status is distinct from old.approval_status or
    new.document is distinct from old.document or
    new.email is distinct from old.email or
    new.terms_accepted_at is distinct from old.terms_accepted_at or
    new.created_at is distinct from old.created_at
  ) then
    raise exception 'Campos protegidos do perfil não podem ser alterados pelo usuário';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_approval_fields() from public, anon, authenticated;

drop trigger if exists protect_profile_approval_fields on public.profiles;
create trigger protect_profile_approval_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_approval_fields();

-- O banco decide o status inicial. Qualquer approval_status enviado pelo
-- navegador é ignorado. Cliente nasce ativo; artesão sempre nasce em análise.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_account_type public.account_type;
  selected_approval_status public.approval_status;
begin
  -- Contas internas criadas manualmente no painel não usam o cadastro público.
  if new.raw_user_meta_data->>'account_type' is null then
    return new;
  end if;

  if new.raw_user_meta_data->>'account_type' not in ('client', 'artisan') then
    raise exception 'Tipo de conta inválido';
  end if;

  selected_account_type := (new.raw_user_meta_data->>'account_type')::public.account_type;
  selected_approval_status := case
    when selected_account_type = 'client' then 'active'::public.approval_status
    when new.raw_user_meta_data->>'registration_mode' = 'assisted' then 'assisted_review'::public.approval_status
    else 'pending_review'::public.approval_status
  end;

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
    selected_account_type,
    selected_approval_status,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'document',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'cep',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'address_number',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'state',
    case when selected_account_type = 'artisan' then new.raw_user_meta_data->>'store_name' end,
    case when selected_account_type = 'artisan' then new.raw_user_meta_data->>'specialty' end,
    case when selected_account_type = 'artisan' then new.raw_user_meta_data->>'story' end,
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;

-- Auditoria manual recomendada depois da execução (não modifica dados):
-- select id, email, store_name, approval_status, created_at
-- from public.profiles
-- where account_type = 'artisan'
-- order by created_at desc;


