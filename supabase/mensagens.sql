-- Execute manualmente no SQL Editor do Supabase (depois do SQL de profiles).

-- =========================================================
-- 1) PEDIDOS (provisório: substitua pela sua tabela real de compras)
-- =========================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  product_name text not null,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Participantes leem o pedido" on public.orders
  for select using (auth.uid() in (client_id, artisan_id));

-- APENAS PARA TESTE: deixa o cliente criar um pedido falso.
-- Em produção, apague esta policy: pedidos devem ser criados pelo backend após o pagamento.
create policy "TESTE - cliente cria pedido" on public.orders
  for insert with check (auth.uid() = client_id);

-- =========================================================
-- 2) CONVERSAS (uma por pedido)
-- =========================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Participantes leem a conversa" on public.conversations
  for select using (auth.uid() in (client_id, artisan_id));
-- Sem policy de insert: a conversa só nasce pela função start_conversation().

-- =========================================================
-- 3) MENSAGENS
-- =========================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "Participantes leem mensagens" on public.messages
  for select using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and auth.uid() in (c.client_id, c.artisan_id))
  );

create policy "Participantes enviam mensagens" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversations c
                where c.id = conversation_id and auth.uid() in (c.client_id, c.artisan_id))
  );
-- Sem update/delete: o histórico fica intacto (serve como registro de reclamação).

-- Atualiza a data da última mensagem
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created after insert on public.messages
  for each row execute procedure public.touch_conversation();

-- =========================================================
-- 4) FUNÇÕES
-- =========================================================
-- Só o COMPRADOR do pedido consegue iniciar a conversa. Se já existir, devolve a mesma.
create or replace function public.start_conversation(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id;

  if not found or v_order.client_id is distinct from auth.uid() then
    raise exception 'Pedido não encontrado ou não pertence a você';
  end if;

  insert into public.conversations (order_id, client_id, artisan_id)
  values (v_order.id, v_order.client_id, v_order.artisan_id)
  on conflict (order_id) do nothing;

  select id into v_id from public.conversations where order_id = p_order_id;
  return v_id;
end;
$$;

-- Lista as conversas do usuário já com nome do produto e da outra pessoa
create or replace function public.list_my_conversations()
returns table (
  conversation_id uuid,
  order_id uuid,
  product_name text,
  other_name text,
  my_role text,
  last_message_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select c.id,
         c.order_id,
         o.product_name,
         case when c.client_id = auth.uid()
              then coalesce(pa.store_name, pa.full_name)
              else pc.full_name end,
         case when c.client_id = auth.uid() then 'client' else 'artisan' end,
         c.last_message_at
  from public.conversations c
  join public.orders o on o.id = c.order_id
  join public.profiles pc on pc.id = c.client_id
  join public.profiles pa on pa.id = c.artisan_id
  where auth.uid() in (c.client_id, c.artisan_id)
  order by c.last_message_at desc;
$$;

revoke execute on function public.start_conversation(uuid) from public, anon;
revoke execute on function public.list_my_conversations() from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;

-- =========================================================
-- 5) REALTIME (mensagens aparecem sem recarregar)
-- =========================================================
alter publication supabase_realtime add table public.messages;
