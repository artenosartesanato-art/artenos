-- Cria (ou recupera) a conta administrativa da Artenós.
-- Execute no SQL Editor do Supabase. Pode ser executado de novo: se o e-mail
-- já existir, só redefine a senha, confirma o e-mail e garante o acesso.
--
-- Antes de executar, troque TROQUE_PELA_SENHA pela senha desejada. Não salve
-- o arquivo com a senha real no repositório. Depois do primeiro acesso,
-- troque a senha em "Esqueci minha senha" se ela tiver sido compartilhada.
--
-- A conta entra em public.admin_users como proprietária (owner), o que libera
-- /administracao (função is_active_admin). Não cria perfil de cliente nem de
-- loja: contas administrativas não precisam de profile.
do $$
declare
  admin_email constant text := 'artenosartesanato@gmail.com';
  admin_senha constant text := 'TROQUE_PELA_SENHA';
  admin_id uuid;
begin
  if admin_senha = 'TROQUE_PELA_SENHA' or length(admin_senha) < 8 then
    raise exception 'Defina a senha (mínimo de 8 caracteres) na linha admin_senha antes de executar.';
  end if;

  select id into admin_id from auth.users where lower(email) = lower(admin_email);

  if admin_id is null then
    admin_id := gen_random_uuid();
    -- Sem account_type nos metadados: o gatilho handle_new_user não cria profile.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      lower(admin_email), extensions.crypt(admin_senha, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), admin_id, admin_id::text, 'email',
      jsonb_build_object('sub', admin_id::text, 'email', lower(admin_email), 'email_verified', true),
      now(), now(), now()
    );
    raise notice 'Conta criada: %', admin_email;
  else
    update auth.users
      set encrypted_password = extensions.crypt(admin_senha, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          banned_until = null,
          updated_at = now()
    where id = admin_id;
    raise notice 'Conta já existia: senha redefinida para %', admin_email;
  end if;

  insert into public.admin_users (user_id, role, active)
  values (admin_id, 'owner', true)
  on conflict (user_id) do update set role = 'owner', active = true, updated_at = now();
end $$;

-- Conferência: deve mostrar o e-mail confirmado e o papel owner ativo.
select u.email, u.email_confirmed_at is not null as email_confirmado, a.role, a.active
from auth.users u
join public.admin_users a on a.user_id = u.id
where lower(u.email) = lower('artenosartesanato@gmail.com');
