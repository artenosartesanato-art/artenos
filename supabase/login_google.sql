-- Login com Google: conclusão do cadastro validada no banco.
-- Execute no SQL Editor do Supabase (pode ser executado de novo).
--
-- Como funciona:
--   * A conta criada pelo Google não traz account_type nos metadados, então o
--     gatilho handle_new_user NÃO cria o profile. Sem profile o cadastro está
--     incompleto: o banco já recusa carrinho, pedidos, mensagens e
--     notificações (todas exigem um profile), e o site leva a pessoa para
--     /concluir-cadastro.
--   * complete_oauth_signup cria o profile da própria conta (auth.uid()) com os
--     dados obrigatórios do cadastro tradicional, validados aqui (não só na
--     tela). O e-mail vem da conta (já confirmado pelo Google), nunca do
--     navegador.
--   * Contas com o mesmo e-mail: o Supabase vincula o Google à conta existente
--     (vinculação automática de identidades com e-mail confirmado); não há
--     segundo usuário e o profile existente continua valendo.
begin;

create or replace function public.valid_cpf(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  total integer;
  check_digit integer;
  position_index integer;
  digit_index integer;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;
  for digit_index in 10..11 loop
    total := 0;
    for position_index in 1..digit_index - 1 loop
      total := total + substr(d, position_index, 1)::integer * (digit_index + 1 - position_index);
    end loop;
    check_digit := (total * 10) % 11 % 10;
    if check_digit <> substr(d, digit_index, 1)::integer then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.valid_cnpj(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  weights_first integer[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  weights_second integer[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  total integer;
  remainder integer;
  i integer;
begin
  if length(d) <> 14 or d ~ '^(\d)\1{13}$' then
    return false;
  end if;
  total := 0;
  for i in 1..12 loop total := total + substr(d, i, 1)::integer * weights_first[i]; end loop;
  remainder := total % 11;
  if (case when remainder < 2 then 0 else 11 - remainder end) <> substr(d, 13, 1)::integer then
    return false;
  end if;
  total := 0;
  for i in 1..13 loop total := total + substr(d, i, 1)::integer * weights_second[i]; end loop;
  remainder := total % 11;
  return (case when remainder < 2 then 0 else 11 - remainder end) = substr(d, 14, 1)::integer;
end;
$$;

-- Mesmas regras do cadastro tradicional (lib/supabase.ts → validBrazilianPhone).
create or replace function public.valid_brazilian_phone(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  subscriber text;
begin
  if length(d) in (12, 13) and left(d, 2) = '55' then
    d := substr(d, 3);
  end if;
  if length(d) not in (10, 11) then return false; end if;
  if left(d, 2) not in ('11','12','13','14','15','16','17','18','19','21','22','24','27','28',
    '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55',
    '61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85',
    '86','87','88','89','91','92','93','94','95','96','97','98','99') then
    return false;
  end if;
  subscriber := substr(d, 3);
  if subscriber ~ '^(\d)\1+$' then return false; end if;
  return case when length(d) = 11 then subscriber ~ '^9\d{8}$' else subscriber ~ '^[2-5]\d{7}$' end;
end;
$$;

-- Situação do cadastro da conta conectada (usada após o retorno do Google).
create or replace function public.my_signup_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'signed_in', auth.uid() is not null,
    'is_admin', coalesce(public.is_active_admin(), false),
    'has_profile', exists (select 1 from public.profiles p where p.id = auth.uid()),
    'account_type', (select p.account_type from public.profiles p where p.id = auth.uid()),
    'approval_status', (select p.approval_status from public.profiles p where p.id = auth.uid()),
    'email', (select u.email from auth.users u where u.id = auth.uid()),
    'providers', (select coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) from auth.users u where u.id = auth.uid())
  );
$$;

create or replace function public.complete_oauth_signup(
  p_account_type text,
  p_registration_mode text,
  p_full_name text,
  p_document text,
  p_phone text,
  p_cep text,
  p_address text,
  p_address_number text,
  p_city text,
  p_state text,
  p_store_name text,
  p_specialty text,
  p_story text,
  p_terms_accepted boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := auth.uid();
  account_email text;
  doc text := regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g');
  phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  cep text := regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g');
  full_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  state text := upper(btrim(coalesce(p_state, '')));
  store text := nullif(btrim(coalesce(p_store_name, '')), '');
  specialty text := nullif(btrim(coalesce(p_specialty, '')), '');
  story text := btrim(coalesce(p_story, ''));
  status public.approval_status;
begin
  if account is null then
    raise exception 'Faça login para concluir o cadastro';
  end if;
  if exists (select 1 from public.profiles p where p.id = account) then
    raise exception 'Este cadastro já foi concluído';
  end if;
  if p_account_type not in ('client', 'artisan') then
    raise exception 'Escolha se a conta é para comprar ou para vender';
  end if;
  select u.email into account_email from auth.users u where u.id = account;
  if account_email is null then
    raise exception 'Conta sem e-mail confirmado';
  end if;

  if coalesce(p_terms_accepted, false) is not true then
    raise exception 'Aceite os Termos de Uso e a Política de Privacidade';
  end if;
  if length(full_name) < 3 or full_name !~ '\S+\s+\S+' or length(full_name) > 120 then
    raise exception 'Nome completo: informe nome e sobrenome';
  end if;
  if not (public.valid_cpf(doc) or (p_account_type = 'artisan' and public.valid_cnpj(doc))) then
    raise exception 'Documento inválido: informe um % válido',
      case when p_account_type = 'artisan' then 'CPF ou CNPJ' else 'CPF' end;
  end if;
  if exists (select 1 from public.profiles p where p.document = doc) then
    raise exception 'Este CPF ou CNPJ já está cadastrado em outra conta';
  end if;
  if exists (select 1 from public.profiles p where lower(p.email) = lower(account_email)) then
    raise exception 'Este e-mail já tem um cadastro. Entre com a senha ou com o Google na conta original';
  end if;
  if not public.valid_brazilian_phone(phone) then
    raise exception 'Telefone inválido: informe um telefone brasileiro com DDD';
  end if;
  if length(cep) <> 8 or cep ~ '^(\d)\1{7}$' then
    raise exception 'CEP inválido';
  end if;
  if length(btrim(coalesce(p_address, ''))) < 3 or length(btrim(coalesce(p_address_number, ''))) < 1
    or length(btrim(coalesce(p_city, ''))) < 2 or state !~ '^[A-Z]{2}$' then
    raise exception 'Endereço incompleto: informe rua, número, cidade e UF';
  end if;
  if p_account_type = 'artisan' and (store is null or specialty is null or length(story) < 40 or length(story) > 1200) then
    raise exception 'Loja: informe o nome, a especialidade e uma história de 40 a 1.200 caracteres';
  end if;

  status := case
    when p_account_type = 'client' then 'active'::public.approval_status
    when p_registration_mode = 'assisted' then 'assisted_review'::public.approval_status
    else 'pending_review'::public.approval_status
  end;

  -- O gatilho enqueue_artisan_application cria a solicitação da loja.
  insert into public.profiles (
    id, account_type, approval_status, full_name, email, document, phone,
    cep, address, address_number, city, state, store_name, specialty, story,
    terms_accepted_at
  ) values (
    account, p_account_type::public.account_type, status, full_name, account_email, doc, phone,
    cep, btrim(p_address), btrim(p_address_number), btrim(p_city), state,
    case when p_account_type = 'artisan' then store end,
    case when p_account_type = 'artisan' then specialty end,
    case when p_account_type = 'artisan' then story end,
    now()
  );

  return status::text;
end;
$$;

revoke all on function public.my_signup_status() from public, anon;
revoke all on function public.complete_oauth_signup(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.my_signup_status() to authenticated;
grant execute on function public.complete_oauth_signup(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) to authenticated;

commit;
