-- Cria uma conta "super admin" para testar a plataforma: é administradora
-- (owner, libera /administracao) E tem perfil de loja aprovada (libera
-- /vendedor e as telas de comprador). Serve como ambiente de teste.
--
-- NÃO altera nenhum dado existente: usa um e-mail novo, só insere linhas
-- (auth.users, auth.identities, admin_users, profiles). Se o e-mail já
-- existir, apenas redefine a senha e garante os acessos dessa mesma conta.
--
-- Antes de executar, troque o e-mail e TROQUE_PELA_SENHA. Não salve a senha
-- real no repositório. Execute no SQL Editor do Supabase.
do $$
declare
  super_email constant text := 'super.admin@artenos.test';
  super_senha constant text := 'TROQUE_PELA_SENHA';
  super_id uuid;
  -- CPF fictício único (formato de 11 dígitos), só para satisfazer a coluna.
  fake_doc text := lpad((floor(random() * 1e11))::bigint::text, 11, '0');
begin
  if super_senha = 'TROQUE_PELA_SENHA' or length(super_senha) < 8 then
    raise exception 'Defina a senha (mínimo de 8 caracteres) em super_senha antes de executar.';
  end if;

  select id into super_id from auth.users where lower(email) = lower(super_email);

  if super_id is null then
    super_id := gen_random_uuid();
    -- Sem account_type nos metadados: o gatilho handle_new_user não cria profile;
    -- o perfil é inserido logo abaixo.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', super_id, 'authenticated', 'authenticated',
      lower(super_email), extensions.crypt(super_senha, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), super_id, super_id::text, 'email',
      jsonb_build_object('sub', super_id::text, 'email', lower(super_email), 'email_verified', true),
      now(), now(), now()
    );
    raise notice 'Conta criada: %', super_email;
  else
    update auth.users
      set encrypted_password = extensions.crypt(super_senha, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          banned_until = null,
          updated_at = now()
    where id = super_id;
    raise notice 'Conta já existia: senha redefinida para %', super_email;
  end if;

  -- Acesso administrativo.
  insert into public.admin_users (user_id, role, active)
  values (super_id, 'owner', true)
  on conflict (user_id) do update set role = 'owner', active = true, updated_at = now();

  -- Perfil de loja aprovada (só cria se ainda não houver; nunca sobrescreve).
  insert into public.profiles (
    id, account_type, approval_status, full_name, email, document, phone,
    cep, address, address_number, city, state, store_name, specialty, story,
    terms_accepted_at
  ) values (
    super_id, 'artisan', 'active', 'Super Admin (teste)', lower(super_email), fake_doc,
    '11999999999', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP',
    'Loja de Teste', 'Teste', 'Conta de teste da equipe.', now()
  )
  on conflict (id) do nothing;
end $$;

select u.email, a.role as papel_admin, a.active, p.account_type, p.approval_status
from auth.users u
join public.admin_users a on a.user_id = u.id
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('super.admin@artenos.test');
