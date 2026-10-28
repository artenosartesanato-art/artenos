-- Notificações da Artenós (sininho do cabeçalho, sons e avisos em tempo real).
-- Execute uma vez no SQL Editor do Supabase. Pode ser executado de novo sem
-- duplicar nada. Não altera nem apaga dados existentes.
--
-- Quem recebe o quê:
--   * nova mensagem ............ quem está do outro lado da conversa;
--   * pedido atualizado pela loja (status, rastreio, transportadora,
--     previsão de entrega ou nota fiscal) ... o cliente daquele pedido;
--   * nova venda paga .......... a loja;
--   * nova solicitação de encomenda ... a loja;
--   * resposta/proposta da loja na encomenda ... o cliente;
--   * cliente cancelou a encomenda ... a loja.
-- Editar uma peça no catálogo NÃO gera notificação: os pedidos guardam uma
-- cópia dos dados da compra, então a edição não muda nada para quem comprou.
--
-- Notificações do mesmo assunto ainda não lidas são agrupadas (ex.: "3 novas
-- mensagens" de uma conversa) para não encher a lista.
begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('mensagem', 'pedido', 'venda', 'encomenda')),
  title text not null,
  body text not null default '',
  link text not null,
  ref_id uuid,
  unread_count integer not null default 1,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);
-- Um aviso não lido por assunto (conversa, pedido ou encomenda).
create unique index if not exists notifications_unread_ref_idx
  on public.notifications (user_id, kind, ref_id)
  where read_at is null and ref_id is not null;

alter table public.notifications enable row level security;
drop policy if exists "Cada pessoa lê as próprias notificações" on public.notifications;
create policy "Cada pessoa lê as próprias notificações" on public.notifications
  for select using (user_id = (select auth.uid()));
-- Sem policy de insert/update/delete: notificações nascem só pelos gatilhos e
-- são marcadas como lidas pela função mark_notifications_read().

-- Cria ou agrupa uma notificação. Uso interno dos gatilhos.
create or replace function public.push_notification(
  p_user_id uuid, p_kind text, p_title text, p_body text, p_link text, p_ref_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, ref_id)
  values (p_user_id, p_kind, p_title, left(coalesce(p_body, ''), 240), p_link, p_ref_id)
  on conflict (user_id, kind, ref_id) where read_at is null and ref_id is not null
  do update set
    title = excluded.title,
    body = excluded.body,
    link = excluded.link,
    created_at = now(),
    unread_count = public.notifications.unread_count + 1;
end;
$$;
revoke all on function public.push_notification(uuid, text, text, text, text, uuid) from public, anon, authenticated;

-- Marca como lidas (todas, ou só as informadas) as notificações de quem chama.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null
    and (p_ids is null or id = any(p_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Nova mensagem → quem recebe.
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  recipient uuid;
  sender_name text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if not found then return new; end if;
  recipient := case when new.sender_id = c.client_id then c.artisan_id else c.client_id end;
  select case when new.sender_id = c.artisan_id
      then coalesce(nullif(p.store_name, ''), p.full_name)
      else p.full_name end
    into sender_name from public.profiles p where p.id = new.sender_id;
  perform public.push_notification(
    recipient, 'mensagem',
    'Nova mensagem de ' || coalesce(nullif(sender_name, ''), 'Artenós'),
    new.body,
    case when recipient = c.artisan_id then '/vendedor/mensagens?conversa=' else '/mensagens?conversa=' end || c.id,
    c.id);
  return new;
end;
$$;
revoke all on function public.notify_new_message() from public, anon, authenticated;
drop trigger if exists notify_new_message on public.messages;
create trigger notify_new_message after insert on public.messages
  for each row execute function public.notify_new_message();

-- Rótulo do status do pedido (o mesmo usado em /pedidos).
create or replace function public.order_status_label(p_status text)
returns text language sql immutable set search_path = '' as $$
  select case p_status
    when 'payment_confirmed' then 'Pagamento confirmado'
    when 'preparing' then 'Em preparação'
    when 'shipped' then 'A caminho'
    when 'out_for_delivery' then 'Saiu para entrega'
    when 'delivered' then 'Entregue'
    when 'delivery_failed' then 'Problema na entrega'
    when 'cancelled' then 'Cancelado'
    when 'refunded' then 'Reembolsado'
    else 'Atualizado' end;
$$;

-- Pedido: nova venda paga → loja; atualização da loja → cliente.
-- Compara via JSON para funcionar mesmo se alguma coluna opcional não existir.
create or replace function public.notify_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  details text[] := '{}';
  status_changed boolean;
begin
  if tg_op = 'INSERT' then
    if n->>'status' = 'payment_confirmed' then
      perform public.push_notification(new.artisan_id, 'venda', 'Nova venda',
        coalesce(n->>'product_name', 'Pedido pago'), '/vendedor/vendas', new.id);
    end if;
    return new;
  end if;

  o := to_jsonb(old);
  -- O próprio cliente não recebe aviso do que ele mesmo fez.
  if (select auth.uid()) = new.client_id then return new; end if;
  status_changed := (n->>'status') is distinct from (o->>'status');
  if (n->>'tracking_code') is distinct from (o->>'tracking_code') and n->>'tracking_code' is not null then
    details := details || ('Código de rastreio: ' || (n->>'tracking_code'));
  end if;
  if (n->>'carrier') is distinct from (o->>'carrier') and n->>'carrier' is not null then
    details := details || ('Transportadora: ' || (n->>'carrier'));
  end if;
  if (n->>'estimated_delivery_date') is distinct from (o->>'estimated_delivery_date')
     and n->>'estimated_delivery_date' is not null then
    details := details || ('Previsão de entrega: ' || to_char((n->>'estimated_delivery_date')::date, 'DD/MM/YYYY'));
  end if;
  if ((n->>'invoice_number') is distinct from (o->>'invoice_number') and n->>'invoice_number' is not null)
     or ((n->>'invoice_url') is distinct from (o->>'invoice_url') and n->>'invoice_url' is not null) then
    details := details || 'Nota fiscal disponível'::text;
  end if;
  if (n->>'tracking_url') is distinct from (o->>'tracking_url') and n->>'tracking_url' is not null
     and cardinality(details) = 0 then
    details := details || 'Link de rastreio disponível'::text;
  end if;
  if not status_changed and cardinality(details) = 0 then return new; end if;

  perform public.push_notification(new.client_id, 'pedido',
    case when status_changed
      then 'Pedido: ' || public.order_status_label(n->>'status')
      else 'Seu pedido foi atualizado' end,
    concat_ws(' · ', n->>'product_name', nullif(array_to_string(details, ' · '), '')),
    '/pedidos', new.id);
  return new;
end;
$$;
revoke all on function public.notify_order_change() from public, anon, authenticated;
drop trigger if exists notify_order_change on public.orders;
create trigger notify_order_change after insert or update on public.orders
  for each row execute function public.notify_order_change();

-- Encomendas: pedido novo → loja; resposta da loja → cliente;
-- cancelamento pelo cliente → loja.
create or replace function public.notify_custom_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  title text := coalesce(n->>'title', 'Encomenda');
  status_label text;
begin
  if tg_op = 'INSERT' then
    perform public.push_notification(new.artisan_id, 'encomenda',
      'Nova solicitação de encomenda', title, '/vendedor/encomendas', new.id);
    return new;
  end if;

  o := to_jsonb(old);
  if (n->>'status') is not distinct from (o->>'status')
     and (n->>'proposed_price') is not distinct from (o->>'proposed_price')
     and (n->>'response_message') is not distinct from (o->>'response_message')
     and (n->>'estimated_delivery_date') is not distinct from (o->>'estimated_delivery_date') then
    return new;
  end if;
  status_label := case n->>'status'
    when 'accepted' then 'aceita' when 'declined' then 'recusada'
    when 'cancelled' then 'cancelada' else 'atualizada' end;

  if (select auth.uid()) = new.client_id then
    perform public.push_notification(new.artisan_id, 'encomenda',
      'Encomenda ' || status_label || ' pelo cliente', title, '/vendedor/encomendas', new.id);
  else
    perform public.push_notification(new.client_id, 'encomenda',
      'Sua encomenda foi ' || status_label,
      concat_ws(' · ', title,
        case when n->>'proposed_price' is not null
          then 'Proposta: R$ ' || translate(to_char((n->>'proposed_price')::numeric, 'FM999G999G990D00'), ',.', '.,') end),
      '/sob-encomenda', new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_custom_order_change() from public, anon, authenticated;
do $$
begin
  if to_regclass('public.custom_order_requests') is not null then
    drop trigger if exists notify_custom_order_change on public.custom_order_requests;
    create trigger notify_custom_order_change after insert or update on public.custom_order_requests
      for each row execute function public.notify_custom_order_change();
  end if;
end $$;

-- Tempo real: o sininho recebe as notificações sem recarregar a página.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;
