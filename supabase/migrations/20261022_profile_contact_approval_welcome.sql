-- Execute uma vez no SQL Editor. Não altera pedidos, estoque ou pagamentos.
begin;

-- O telefone é apenas contato do perfil; e-mail continua confirmado no Auth.
grant update (phone) on public.profiles to authenticated;
-- Mantém a proteção do e-mail: só reflete o valor confirmado em auth.users.
create or replace function public.protect_profile_approval_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) = old.id and (
    new.id is distinct from old.id or
    new.account_type is distinct from old.account_type or
    new.approval_status is distinct from old.approval_status or
    new.document is distinct from old.document or
    new.terms_accepted_at is distinct from old.terms_accepted_at or
    new.created_at is distinct from old.created_at or
    (new.email is distinct from old.email and
      new.email is distinct from (select email from auth.users where id = old.id))
  ) then
    raise exception 'Campos protegidos do perfil não podem ser alterados pelo usuário';
  end if;
  return new;
end $$;
create or replace function public.sync_confirmed_profile_contact()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = coalesce(new.email, email),
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_confirmed_profile_contact on auth.users;
create trigger sync_confirmed_profile_contact
  after update of email on auth.users
  for each row execute function public.sync_confirmed_profile_contact();

-- Contas já aprovadas não recebem uma mensagem retroativa.
alter table public.profiles add column if not exists approval_welcome_seen_at timestamptz;
update public.profiles set approval_welcome_seen_at = now()
 where account_type = 'artisan' and approval_status = 'active'
   and approval_welcome_seen_at is null;

create or replace function public.reset_artisan_approval_welcome()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_type = 'artisan' and new.approval_status = 'active'
     and old.approval_status is distinct from 'active' then
    new.approval_welcome_seen_at := null;
  end if;
  return new;
end $$;
drop trigger if exists reset_artisan_approval_welcome on public.profiles;
create trigger reset_artisan_approval_welcome
  before update of approval_status on public.profiles
  for each row execute function public.reset_artisan_approval_welcome();

create or replace function public.claim_artisan_approval_welcome()
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed boolean;
begin
  update public.profiles set approval_welcome_seen_at = now()
   where id = (select auth.uid()) and account_type = 'artisan'
     and approval_status = 'active' and approval_welcome_seen_at is null
   returning true into claimed;
  return coalesce(claimed, false);
end $$;
revoke all on function public.claim_artisan_approval_welcome() from public, anon;
grant execute on function public.claim_artisan_approval_welcome() to authenticated;

commit;
