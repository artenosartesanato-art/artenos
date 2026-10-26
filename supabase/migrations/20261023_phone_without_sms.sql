-- Execute após 20261022_profile_contact_approval_welcome.sql se o script
-- anterior já havia sido executado. É seguro executar mais de uma vez.
-- O telefone passa a ser contato editável do perfil, sem SMS/Auth por telefone.
begin;

grant update (phone) on public.profiles to authenticated;

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
    update public.profiles set email = new.email, updated_at = now()
     where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_confirmed_profile_contact on auth.users;
create trigger sync_confirmed_profile_contact
  after update of email on auth.users
  for each row execute function public.sync_confirmed_profile_contact();

commit;
