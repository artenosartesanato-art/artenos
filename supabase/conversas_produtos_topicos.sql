-- Execute uma vez no SQL Editor do Supabase antes de publicar o novo chat.
-- Mantém pedidos, encomendas e mensagens existentes.
begin;

alter table public.conversations
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists product_name_snapshot text;

create unique index if not exists conversations_product_client_unique
  on public.conversations (client_id, product_id)
  where product_id is not null and order_id is null and custom_order_request_id is null;

alter table public.messages
  add column if not exists topic text not null default 'geral',
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null;

alter table public.messages drop constraint if exists messages_topic_check;
alter table public.messages add constraint messages_topic_check
  check (topic in ('geral', 'produto', 'personalizacao', 'prazo', 'entrega', 'outro'));

create index if not exists messages_reply_to_idx on public.messages (reply_to_id)
  where reply_to_id is not null;

-- Uma resposta só pode apontar para uma mensagem da mesma conversa.
create or replace function public.validate_message_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.messages original
    where original.id = new.reply_to_id and original.conversation_id = new.conversation_id
  ) then
    raise exception 'A mensagem respondida não pertence a esta conversa';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_message_reply on public.messages;
create trigger validate_message_reply
  before insert or update of conversation_id, reply_to_id on public.messages
  for each row execute function public.validate_message_reply();
revoke all on function public.validate_message_reply() from public, anon, authenticated;

-- Reutiliza uma conversa de produto para o mesmo cliente. Somente produtos
-- publicados por lojas públicas podem receber perguntas.
create or replace function public.start_product_conversation(p_product_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  viewer_id uuid := (select auth.uid());
  piece record;
  conversation_id uuid;
begin
  if viewer_id is null then raise exception 'Faça login para conversar com a loja'; end if;
  select p.id, p.artisan_id, p.name into piece
    from public.products p
    where p.id = p_product_id and p.active
      and public.is_public_artisan(p.artisan_id)
    for share;
  if not found then raise exception 'Produto indisponível'; end if;
  if piece.artisan_id = viewer_id then
    raise exception 'Você não pode iniciar uma conversa com a própria loja';
  end if;

  insert into public.conversations
    (client_id, artisan_id, product_id, product_name_snapshot)
  values (viewer_id, piece.artisan_id, piece.id, piece.name)
  on conflict do nothing
  returning id into conversation_id;

  if conversation_id is null then
    select c.id into conversation_id from public.conversations c
      where c.client_id = viewer_id and c.product_id = piece.id
        and c.order_id is null and c.custom_order_request_id is null;
  end if;
  if conversation_id is null then raise exception 'Não foi possível abrir a conversa'; end if;
  return conversation_id;
end;
$$;
revoke all on function public.start_product_conversation(uuid) from public, anon;
grant execute on function public.start_product_conversation(uuid) to authenticated;

-- Novo endpoint de leitura: preserva a função antiga usada por integrações
-- existentes e inclui pedidos, encomendas e perguntas sobre produtos.
create or replace function public.list_my_conversations_v2()
returns table (
  conversation_id uuid,
  order_id uuid,
  product_id uuid,
  product_name text,
  other_name text,
  my_role text,
  kind text,
  last_message_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select c.id, c.order_id, c.product_id,
    coalesce(o.product_name, request.title, c.product_name_snapshot, p.name, 'Conversa'),
    case when c.client_id = (select auth.uid())
      then coalesce(nullif(artisan.store_name, ''), artisan.full_name)
      else client.full_name end,
    case when c.client_id = (select auth.uid()) then 'client' else 'artisan' end,
    case when c.order_id is not null then 'pedido'
      when c.custom_order_request_id is not null then 'encomenda'
      else 'produto' end,
    c.last_message_at
  from public.conversations c
  left join public.orders o on o.id = c.order_id
  left join public.custom_order_requests request on request.id = c.custom_order_request_id
  left join public.products p on p.id = c.product_id
  join public.profiles client on client.id = c.client_id
  join public.profiles artisan on artisan.id = c.artisan_id
  where (select auth.uid()) in (c.client_id, c.artisan_id)
  order by c.last_message_at desc;
$$;
revoke all on function public.list_my_conversations_v2() from public, anon;
grant execute on function public.list_my_conversations_v2() to authenticated;

commit;
