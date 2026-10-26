-- Execute manualmente no SQL Editor do Supabase. Rode UMA vez só.
-- Pré-requisitos já rodados: profiles, mensagens.sql (orders) e carrinho.sql (products, cart_items).
--
-- Fluxo:
--   create_checkout_from_cart()  -> cliente clica em "Comprar": congela os itens e o total (preço vem de products)
--   [servidor] cria o pagamento no Mercado Pago (Pix ou cartão)
--   finalize_checkout()          -> pagamento aprovado: cria os pedidos (libera o chat), calcula o repasse
--                                   de cada artesã (menos a % do Artenós e a taxa do Mercado Pago),
--                                   esvazia o carrinho. Idempotente: pode ser chamada várias vezes.
--   claim_due_payouts / finish_payout -> fila de repasses (Pix para a artesã)

-- =========================================================
-- 1) TABELAS
-- =========================================================

-- Uma compra (um pagamento). Pode ter itens de várias artesãs.
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete restrict,
  total_amount numeric(10,2) not null check (total_amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_payment', 'approved', 'cancelled', 'refunded')),
  mp_payment_id text,
  mp_status text,
  mp_status_detail text,
  payment_method text,                 -- 'bank_transfer' (Pix), 'credit_card', ...
  gateway_fee numeric(10,2),           -- taxa do Mercado Pago
  platform_fee_percent numeric(5,2),   -- % do Artenós aplicada nesta compra
  pix_qr_code text,                    -- Pix copia e cola (enquanto aguarda pagamento)
  pix_qr_code_base64 text,
  pix_expires_at timestamptz,
  paid_at timestamptz,
  receipt_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index checkouts_client_idx on public.checkouts (client_id, created_at desc);
create unique index checkouts_mp_payment_uidx on public.checkouts (mp_payment_id) where mp_payment_id is not null;

-- Itens congelados no momento da compra (nome e preço não mudam se o produto for editado depois).
create table public.checkout_items (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.checkouts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  artisan_id uuid not null references public.profiles(id) on delete restrict,
  product_name text not null,
  unit_price numeric(10,2) not null check (unit_price > 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total numeric(10,2) not null check (line_total > 0)
);

create index checkout_items_checkout_idx on public.checkout_items (checkout_id);
create index checkout_items_artisan_idx on public.checkout_items (artisan_id);

-- Repasse: quanto cada artesã recebe de cada compra.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.checkouts(id) on delete restrict,
  artisan_id uuid not null references public.profiles(id) on delete restrict,
  gross_amount numeric(10,2) not null,      -- soma dos itens dela
  platform_fee numeric(10,2) not null,      -- % do Artenós
  gateway_fee numeric(10,2) not null,       -- parte dela na taxa do Mercado Pago
  net_amount numeric(10,2) not null check (net_amount >= 0),  -- o que ela recebe
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  release_after timestamptz not null default now(),  -- só repassa depois desta data (ex.: após a entrega)
  attempts integer not null default 0,
  mp_payout_id text,
  last_error text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checkout_id, artisan_id)
);

create index payouts_due_idx on public.payouts (status, release_after);
create index payouts_artisan_idx on public.payouts (artisan_id, created_at desc);

-- Chave Pix da artesã (para onde o repasse vai). Só ela e o servidor enxergam.
create table public.payout_accounts (
  artisan_id uuid primary key references public.profiles(id) on delete cascade,
  pix_key_type text not null check (pix_key_type in ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'PIX_CODE')),
  pix_key text not null check (char_length(btrim(pix_key)) between 5 and 140),
  updated_at timestamptz not null default now()
);

-- Pedido gerado a partir de um item pago (é o que libera o chat). Unique = não duplica se o webhook repetir.
alter table public.orders add column if not exists checkout_item_id uuid
  references public.checkout_items(id) on delete set null;
alter table public.orders add constraint orders_checkout_item_key unique (checkout_item_id);

-- Mantém updated_at em dia
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger checkouts_set_updated_at before update on public.checkouts
  for each row execute procedure public.set_updated_at();
create trigger payouts_set_updated_at before update on public.payouts
  for each row execute procedure public.set_updated_at();
create trigger payout_accounts_set_updated_at before update on public.payout_accounts
  for each row execute procedure public.set_updated_at();

-- =========================================================
-- 2) SEGURANÇA (RLS)
-- Gravações em checkouts/itens/repasses só acontecem pelas funções abaixo, executadas pelo servidor.
-- =========================================================
alter table public.checkouts enable row level security;
alter table public.checkout_items enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_accounts enable row level security;

create policy "Cliente le as proprias compras" on public.checkouts
  for select using (client_id = auth.uid());

create policy "Cliente e artesa leem os itens" on public.checkout_items
  for select using (
    artisan_id = auth.uid()
    or exists (select 1 from public.checkouts c where c.id = checkout_id and c.client_id = auth.uid())
  );

create policy "Artesa le os proprios repasses" on public.payouts
  for select using (artisan_id = auth.uid());

create policy "Artesa le a propria chave Pix" on public.payout_accounts
  for select using (artisan_id = auth.uid());
create policy "Artesa cadastra a propria chave Pix" on public.payout_accounts
  for insert with check (artisan_id = auth.uid());
create policy "Artesa altera a propria chave Pix" on public.payout_accounts
  for update using (artisan_id = auth.uid()) with check (artisan_id = auth.uid());

-- =========================================================
-- 3) FUNÇÕES
-- =========================================================

-- Cliente clica em "Comprar": congela o carrinho numa compra e devolve o id.
-- O preço vem da tabela products (nunca do navegador). Compras abertas anteriores são canceladas
-- (se o Pix delas for pago depois, finalize_checkout ainda honra o pagamento).
create or replace function public.create_checkout_from_cart()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_total numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Faça login para comprar';
  end if;

  -- PRODUÇÃO: descomente para impedir que a artesã compre o próprio produto.
  -- if exists (select 1 from public.cart_items ci join public.products p on p.id = ci.product_id
  --            where ci.client_id = auth.uid() and p.artisan_id = auth.uid()) then
  --   raise exception 'Você não pode comprar o seu próprio produto';
  -- end if;

  select sum(round(p.price * ci.quantity, 2)) into v_total
  from public.cart_items ci
  join public.products p on p.id = ci.product_id and p.active
  where ci.client_id = auth.uid();

  if v_total is null or v_total <= 0 then
    raise exception 'Seu carrinho está vazio ou os produtos não estão mais disponíveis';
  end if;

  update public.checkouts set status = 'cancelled'
   where client_id = auth.uid() and status in ('pending', 'awaiting_payment');

  insert into public.checkouts (client_id, total_amount)
  values (auth.uid(), v_total)
  returning id into v_id;

  insert into public.checkout_items (checkout_id, product_id, artisan_id, product_name, unit_price, quantity, line_total)
  select v_id, p.id, p.artisan_id, p.name, p.price, ci.quantity, round(p.price * ci.quantity, 2)
  from public.cart_items ci
  join public.products p on p.id = ci.product_id and p.active
  where ci.client_id = auth.uid();

  return v_id;
end;
$$;

-- SÓ O SERVIDOR (service_role). Pagamento aprovado: cria pedidos, repasses, esvazia o carrinho.
-- Devolve true na primeira vez e false se já tinha sido finalizada (seguro repetir).
-- Quem arca com a taxa do Mercado Pago é a artesã, proporcional à parte dela (como no split do Mercado Pago).
create or replace function public.finalize_checkout(
  p_checkout_id uuid,
  p_mp_payment_id text,
  p_payment_method text,
  p_gateway_fee numeric,
  p_fee_percent numeric,
  p_hold_days integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_checkout public.checkouts;
  v_fee numeric := greatest(coalesce(p_gateway_fee, 0), 0);
  v_pct numeric := least(greatest(coalesce(p_fee_percent, 0), 0), 100);
begin
  select * into v_checkout from public.checkouts where id = p_checkout_id for update;
  if not found then
    raise exception 'Compra não encontrada';
  end if;
  if v_checkout.status in ('approved', 'refunded') then
    return false;
  end if;

  -- Um pedido por item pago: é ele que libera a conversa em /mensagens.
  insert into public.orders (client_id, artisan_id, product_name, checkout_item_id)
  select v_checkout.client_id,
         ci.artisan_id,
         case when ci.quantity > 1 then ci.product_name || ' (x' || ci.quantity || ')' else ci.product_name end,
         ci.id
  from public.checkout_items ci
  where ci.checkout_id = v_checkout.id
  on conflict (checkout_item_id) do nothing;

  -- Um repasse por artesã.
  insert into public.payouts (checkout_id, artisan_id, gross_amount, platform_fee, gateway_fee, net_amount, release_after)
  select v_checkout.id,
         g.artisan_id,
         g.gross,
         round(g.gross * v_pct / 100, 2),
         round(v_fee * g.gross / v_checkout.total_amount, 2),
         greatest(g.gross - round(g.gross * v_pct / 100, 2) - round(v_fee * g.gross / v_checkout.total_amount, 2), 0),
         now() + make_interval(days => greatest(coalesce(p_hold_days, 0), 0))
  from (
    select artisan_id, sum(line_total) as gross
    from public.checkout_items
    where checkout_id = v_checkout.id
    group by artisan_id
  ) g
  on conflict (checkout_id, artisan_id) do nothing;

  update public.checkouts
     set status = 'approved',
         paid_at = now(),
         mp_payment_id = p_mp_payment_id,
         mp_status = 'approved',
         payment_method = coalesce(p_payment_method, payment_method),
         gateway_fee = v_fee,
         platform_fee_percent = v_pct,
         pix_qr_code = null,
         pix_qr_code_base64 = null
   where id = v_checkout.id;

  -- Tira do carrinho o que foi comprado.
  delete from public.cart_items
   where client_id = v_checkout.client_id
     and product_id in (select product_id from public.checkout_items
                         where checkout_id = v_checkout.id and product_id is not null);

  return true;
end;
$$;

-- SÓ O SERVIDOR. Reembolso/estorno: cancela repasses ainda não pagos.
-- Devolve quantos repasses JÁ tinham sido pagos (esses exigem acerto manual com a artesã).
create or replace function public.mark_checkout_refunded(p_checkout_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_updated integer;
  v_paid integer := 0;
begin
  update public.checkouts set status = 'refunded'
   where id = p_checkout_id and status = 'approved';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return 0;
  end if;

  update public.payouts set status = 'cancelled'
   where checkout_id = p_checkout_id and status in ('pending', 'failed');

  select count(*) into v_paid from public.payouts
   where checkout_id = p_checkout_id and status in ('paid', 'processing');
  return v_paid;
end;
$$;

-- SÓ O SERVIDOR. Pega repasses vencidos e marca como "processing" (várias execuções simultâneas não pegam o mesmo).
create or replace function public.claim_due_payouts(p_limit integer default 20)
returns setof public.payouts language sql security definer set search_path = '' as $$
  update public.payouts p
     set status = 'processing', attempts = p.attempts + 1
   where p.id in (
     select id from public.payouts
      where status = 'pending' and release_after <= now()
      order by created_at
      limit greatest(p_limit, 1)
      for update skip locked
   )
  returning p.*;
$$;

-- SÓ O SERVIDOR (ou você, no SQL Editor, para repasse manual).
-- p_result: 'paid' (pago) | 'sent' (enviado ao Mercado Pago, aguardando confirmação) |
--           'retry' (tenta de novo; vira 'failed' após 5 tentativas) | 'failed' (erro definitivo)
create or replace function public.finish_payout(
  p_id uuid, p_result text, p_reference text default null, p_error text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_result not in ('paid', 'sent', 'retry', 'failed') then
    raise exception 'Resultado inválido: %', p_result;
  end if;

  update public.payouts
     set status = case
           when p_result = 'paid' then 'paid'
           when p_result = 'sent' then 'processing'
           when p_result = 'failed' then 'failed'
           when attempts >= 5 then 'failed'
           else 'pending'
         end,
         mp_payout_id = coalesce(p_reference, mp_payout_id),
         paid_at = case when p_result = 'paid' then now() else paid_at end,
         last_error = case when p_result in ('paid', 'sent') then null else p_error end
   where id = p_id and status in ('pending', 'processing', 'failed');
end;
$$;

-- =========================================================
-- 4) PERMISSÕES (sem isso dá "permission denied for table ...")
-- =========================================================
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

grant select on public.checkouts, public.checkout_items, public.payouts to authenticated;
grant select, insert, update on public.payout_accounts to authenticated;

revoke execute on function public.create_checkout_from_cart() from public, anon;
grant execute on function public.create_checkout_from_cart() to authenticated;

revoke all on function public.finalize_checkout(uuid, text, text, numeric, numeric, integer) from public, anon, authenticated;
revoke all on function public.mark_checkout_refunded(uuid) from public, anon, authenticated;
revoke all on function public.claim_due_payouts(integer) from public, anon, authenticated;
revoke all on function public.finish_payout(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_checkout(uuid, text, text, numeric, numeric, integer) to service_role;
grant execute on function public.mark_checkout_refunded(uuid) to service_role;
grant execute on function public.claim_due_payouts(integer) to service_role;
grant execute on function public.finish_payout(uuid, text, text, text) to service_role;

-- =========================================================
-- 5) AO IR PARA PRODUÇÃO (descomente e rode)
-- =========================================================
-- drop policy "TESTE - cliente cria pedido" on public.orders;      -- pedidos agora só nascem de pagamento aprovado
-- drop policy "TESTE - cria produto proprio" on public.products;   -- produtos pelo painel da artesã
-- drop function public.checkout_cart();                            -- "compra de teste" do carrinho.sql
-- (e descomente a regra "não comprar o próprio produto" em create_checkout_from_cart)
