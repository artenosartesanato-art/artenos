-- Execute uma vez no SQL Editor antes de criar a conta administrativa
-- em Authentication > Users.
-- Usuários do site continuam obrigados a enviar todos os dados cadastrais.
-- Apenas usuários criados manualmente sem account_type deixam de gerar profile.

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
    id, account_type, approval_status, full_name, email, document, phone,
    cep, address, address_number, city, state, store_name, specialty, story,
    terms_accepted_at
  ) values (
    new.id, selected_account_type, selected_approval_status,
    new.raw_user_meta_data->>'full_name', new.email,
    new.raw_user_meta_data->>'document', new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'cep', new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'address_number', new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'state',
    case when selected_account_type = 'artisan' then new.raw_user_meta_data->>'store_name' end,
    case when selected_account_type = 'artisan' then new.raw_user_meta_data->>'specialty' end,
    case when selected_account_type = 'artisan' then new.raw_user_meta_data->>'story' end,
    (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz
  );

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Depois de criar o usuário no painel, conceda acesso de proprietária:
-- insert into public.admin_users (user_id, role, active)
-- select id, 'owner', true from auth.users
-- where lower(email) = lower('artenos.artesanato@gmail.com')
-- on conflict (user_id) do update
-- set role = 'owner', active = true, updated_at = now();
