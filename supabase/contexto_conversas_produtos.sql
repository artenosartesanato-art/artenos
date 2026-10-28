-- Execute no SQL Editor após conversas_produtos_topicos.sql.
-- Apenas cria a consulta de contexto. Não altera nem apaga registros.
begin;

create or replace function public.list_my_conversations_v3()
returns table (
  conversation_id uuid,
  order_id uuid,
  product_id uuid,
  product_name text,
  other_name text,
  my_role text,
  kind text,
  last_message_at timestamptz,
  artisan_id uuid,
  artisan_name text,
  store_name text,
  product_image_url text
) language sql stable security definer set search_path = '' as $$
  select c.id, c.order_id, c.product_id,
    coalesce(o.product_name, request.title, p.name, c.product_name_snapshot, 'Conversa'),
    case when c.client_id = (select auth.uid())
      then coalesce(nullif(artisan.store_name, ''), artisan.full_name)
      else client.full_name end,
    case when c.client_id = (select auth.uid()) then 'client' else 'artisan' end,
    case when c.order_id is not null then 'pedido'
      when c.custom_order_request_id is not null then 'encomenda'
      else 'produto' end,
    c.last_message_at, c.artisan_id, artisan.full_name,
    artisan.store_name, p.image_url
  from public.conversations c
  left join public.orders o on o.id = c.order_id
  left join public.custom_order_requests request on request.id = c.custom_order_request_id
  left join public.products p on p.id = c.product_id
  join public.profiles client on client.id = c.client_id
  join public.profiles artisan on artisan.id = c.artisan_id
  where (select auth.uid()) in (c.client_id, c.artisan_id)
  order by c.last_message_at desc;
$$;

revoke all on function public.list_my_conversations_v3() from public, anon;
grant execute on function public.list_my_conversations_v3() to authenticated;

commit;
