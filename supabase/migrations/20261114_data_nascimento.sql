-- Data de nascimento e idade mínima (18 anos).
-- A Artenós é só para maiores de 18. A data é DECLARADA pela pessoa (não há
-- conferência com a Receita Federal aqui; veja docs/IDADE-MINIMA.md):
--   * cadastro novo (e-mail e senha ou Google): a data vai nos metadados da
--     conta (birth_date, AAAA-MM-DD) e o gatilho abaixo copia para o profile.
--     Menor de 18 não cria a conta;
--   * conta antiga (sem data): o site pede a data no próximo acesso e só libera
--     o uso depois (set_my_birth_date). Quem declarar menos de 18 fica com a
--     conta bloqueada até completar 18 anos;
--   * conta bloqueada entra e navega, mas não compra, favorita, envia mensagens
--     nem altera a loja (mesmas tabelas da suspensão).
-- A própria pessoa não altera a data depois de informada (a coluna fica fora
-- do grant de update de profiles); a correção é feita pela equipe.
-- Pode ser executada de novo. Rode depois de 20261109_suspensao_conta.sql.
begin;

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists age_blocked_at timestamptz;

comment on column public.profiles.birth_date is 'Data de nascimento declarada pela pessoa (idade mínima: 18 anos).';
comment on column public.profiles.age_blocked_at is 'Quando a conta declarou ter menos de 18 anos (bloqueio vale enquanto for menor).';

-- Hoje no fuso do Brasil (a idade muda à meia-noite de Brasília).
create or replace function public.age_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.age_in_years(p_birth_date date)
returns integer language sql stable set search_path = '' as $$
  select extract(year from age(public.age_today(), p_birth_date))::integer;
$$;

-- Data possível: nem no futuro, nem com mais de 120 anos.
create or replace function public.valid_birth_date(p_birth_date date)
returns boolean language sql stable set search_path = '' as $$
  select p_birth_date is not null
     and p_birth_date <= public.age_today()
     and p_birth_date >= public.age_today() - interval '120 years';
$$;

-- 1) Cadastro novo: copia a data dos metadados e barra menores -------------------
create or replace function public.profile_birth_date_on_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_raw text;
begin
  if new.birth_date is null then
    select u.raw_user_meta_data->>'birth_date' into v_raw from auth.users u where u.id = new.id;
    if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        new.birth_date := v_raw::date;
      exception when others then
        raise exception 'Data de nascimento inválida';
      end;
    end if;
  end if;
  -- Sem data (site ainda na versão antiga): a conta nasce e o site pede depois.
  if new.birth_date is null then return new; end if;
  if not public.valid_birth_date(new.birth_date) then
    raise exception 'Data de nascimento inválida';
  end if;
  if public.age_in_years(new.birth_date) < 18 then
    raise exception 'É preciso ter 18 anos ou mais para criar uma conta na Artenós';
  end if;
  return new;
end $$;
revoke all on function public.profile_birth_date_on_insert() from public, anon, authenticated;

drop trigger if exists profile_birth_date_on_insert on public.profiles;
create trigger profile_birth_date_on_insert before insert on public.profiles
  for each row execute function public.profile_birth_date_on_insert();

-- 2) Situação da conta conectada ---------------------------------------------------
create or replace function public.is_age_blocked(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.birth_date is not null and public.age_in_years(p.birth_date) < 18);
$$;
revoke all on function public.is_age_blocked(uuid) from public, anon, authenticated;

-- Sem linha = conta sem profile (cadastro ainda não concluído).
create or replace function public.get_my_age_gate()
returns table (birth_date_missing boolean, age_blocked boolean, unblock_on date)
language sql stable security definer set search_path = '' as $$
  select p.birth_date is null,
         p.birth_date is not null and public.age_in_years(p.birth_date) < 18,
         case when p.birth_date is not null and public.age_in_years(p.birth_date) < 18
              then (p.birth_date + interval '18 years')::date end
  from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.get_my_age_gate() from public, anon;
grant execute on function public.get_my_age_gate() to authenticated;

-- 3) Conta antiga informa a data (uma única vez) -----------------------------------
-- Retorna 'ok' ou 'blocked' (menor de 18: a data fica gravada e a conta bloqueada).
create or replace function public.set_my_birth_date(p_birth_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare v_current date;
begin
  if auth.uid() is null then
    raise exception 'Faça login para informar a data de nascimento';
  end if;
  select p.birth_date into v_current from public.profiles p where p.id = auth.uid() for update;
  if not found then
    raise exception 'Conclua seu cadastro antes de informar a data de nascimento';
  end if;
  if v_current is not null then
    raise exception 'A data de nascimento já foi informada. Para corrigir, fale com o atendimento da Artenós';
  end if;
  if not public.valid_birth_date(p_birth_date) then
    raise exception 'Data de nascimento inválida';
  end if;
  if public.age_in_years(p_birth_date) < 18 then
    update public.profiles set birth_date = p_birth_date, age_blocked_at = now() where id = auth.uid();
    return 'blocked';
  end if;
  update public.profiles set birth_date = p_birth_date, age_blocked_at = null where id = auth.uid();
  return 'ok';
end $$;
revoke all on function public.set_my_birth_date(date) from public, anon;
grant execute on function public.set_my_birth_date(date) to authenticated;

-- 4) Conta de menor não movimenta a plataforma ---------------------------------------
create or replace function public.account_age_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not coalesce(public.is_active_admin(), false)
     and public.is_age_blocked(auth.uid()) then
    raise exception 'Conta bloqueada: a Artenós é só para maiores de 18 anos.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.account_age_guard() from public, anon, authenticated;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'cart_items', 'cart_shipping_selections', 'buy_now_intents', 'checkout_items',
    'storefront_favorites', 'product_reviews', 'store_reviews',
    'custom_order_requests', 'custom_order_services', 'products', 'artisan_store_settings',
    'artisan_pricing_calculations', 'payout_accounts'];
  v_insert_only text[] := array['conversations', 'messages', 'checkouts', 'orders'];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists account_age_guard on public.%I', v_table);
      execute format('create trigger account_age_guard before insert or update on public.%I
        for each row execute function public.account_age_guard()', v_table);
    end if;
  end loop;
  foreach v_table in array v_insert_only loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists account_age_guard on public.%I', v_table);
      execute format('create trigger account_age_guard before insert on public.%I
        for each row execute function public.account_age_guard()', v_table);
    end if;
  end loop;
end $$;

commit;

-- Conferência (só leitura): quantas contas ainda não informaram a data.
-- select count(*) filter (where birth_date is null) as sem_data,
--        count(*) filter (where birth_date is not null and public.age_in_years(birth_date) < 18) as bloqueadas
-- from public.profiles;
--
-- Correção feita pela equipe (ex.: a pessoa digitou o ano errado e ficou bloqueada):
-- o site volta a pedir a data no próximo acesso.
-- update public.profiles set birth_date = null, age_blocked_at = null where email = 'pessoa@exemplo.com';
