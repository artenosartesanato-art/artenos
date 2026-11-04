-- Artenós: Central de Ajuda (chamados com protocolo) e limite de tentativas
-- no servidor (usado pelo formulário de contato e pelas rotas de segurança).
-- Execute UMA vez no SQL Editor. Pode ser repetido.

begin;

-- Limite de requisições por chave (IP, e-mail, usuário), sempre no servidor.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_lookup_idx on public.rate_limit_events (bucket, key_hash, created_at desc);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from public, anon, authenticated;

-- true = pode seguir (e registra a tentativa); false = passou do limite na janela.
create or replace function public.rate_limit_hit(p_bucket text, p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hash text := md5(coalesce(p_key, '')); v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_bucket || ':' || v_hash, 0));
  delete from public.rate_limit_events
    where bucket = p_bucket and key_hash = v_hash and created_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into v_count from public.rate_limit_events where bucket = p_bucket and key_hash = v_hash;
  if v_count >= p_limit then return false; end if;
  insert into public.rate_limit_events(bucket, key_hash) values (p_bucket, v_hash);
  return true;
end $$;
revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

create sequence if not exists public.support_ticket_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique default
    ('ART-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD') || '-' || lpad(nextval('public.support_ticket_seq')::text, 5, '0')),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  topic text not null check (topic in ('compra', 'encomenda', 'pagamento', 'frete', 'troca', 'vender', 'conta', 'privacidade', 'outro')),
  order_code text check (order_code is null or char_length(order_code) <= 40),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_created_idx on public.support_tickets (created_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;
grant usage on sequence public.support_ticket_seq to service_role;
grant select, insert, update on public.support_tickets to service_role;

-- Painel: chamados recentes.
create or replace function public.admin_list_support_tickets(p_status text default 'open')
returns table (id uuid, protocol text, name text, email text, topic text, order_code text, message text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  return query select t.id, t.protocol, t.name, t.email, t.topic, t.order_code, t.message, t.status, t.created_at
    from public.support_tickets t where p_status = 'all' or t.status = p_status order by t.created_at desc limit 200;
end $$;
revoke all on function public.admin_list_support_tickets(text) from public, anon;
grant execute on function public.admin_list_support_tickets(text) to authenticated;

create or replace function public.admin_set_support_ticket_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_assert();
  if p_status not in ('open', 'answered', 'closed') then raise exception 'Status inválido'; end if;
  update public.support_tickets set status = p_status where id = p_id;
end $$;
revoke all on function public.admin_set_support_ticket_status(uuid, text) from public, anon;
grant execute on function public.admin_set_support_ticket_status(uuid, text) to authenticated;

commit;
