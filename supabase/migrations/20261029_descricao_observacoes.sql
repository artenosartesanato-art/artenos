-- Artenós: descrição da peça no carrinho/checkout e "Observações para a loja"
-- em itens sob encomenda. Execute UMA vez depois de
-- 20261029_disponibilidade_estoque.sql e 20261029_moderacao_chat.sql. Pode ser repetido.
--
-- As observações ficam no item do carrinho, são copiadas para checkout_items e
-- order_items por trigger (sem mexer nas funções de checkout) e passam pelo
-- filtro de termos. O resumo da descrição é congelado no item da compra.

begin;

alter table public.products drop constraint if exists products_description_length;
alter table public.products add constraint products_description_length
  check (description is null or char_length(description) <= 2000) not valid;

alter table public.cart_items add column if not exists customer_notes text;
alter table public.cart_items drop constraint if exists cart_items_customer_notes_length;
alter table public.cart_items add constraint cart_items_customer_notes_length
  check (customer_notes is null or char_length(customer_notes) <= 500);
alter table public.checkout_items
  add column if not exists customer_notes text,
  add column if not exists product_summary text;
alter table public.order_items
  add column if not exists customer_notes text,
  add column if not exists product_summary text;

-- Resumo em texto corrido (mesma ideia de plainSummary em lib/rich-text.ts).
create or replace function public.text_summary(p_text text, p_max integer default 160)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(t) <= p_max then t else left(t, p_max - 1) || '…' end
  from (select btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
    '\*\*([^*]+)\*\*', '\1', 'g'), '(^|\n)\s*([-•*]|\d{1,2}[.)])\s+', '\1', 'g'), '\s+', ' ', 'g')) as t) s;
$$;

create or replace function public.set_cart_item_notes(p_item_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_availability text;
begin
  if auth.uid() is null then raise exception 'Faça login para usar o carrinho'; end if;
  select product.availability into v_availability
    from public.cart_items item join public.products product on product.id = item.product_id
    where item.id = p_item_id and item.client_id = auth.uid();
  if not found then raise exception 'Item não encontrado'; end if;
  if v_availability <> 'made_to_order' and nullif(btrim(coalesce(p_notes, '')), '') is not null then
    raise exception 'Observações são aceitas apenas em peças sob encomenda';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then raise exception 'Use no máximo 500 caracteres nas observações'; end if;
  perform public.moderation_assert_clean(p_notes);
  update public.cart_items set customer_notes = nullif(btrim(p_notes), ''), updated_at = now()
    where id = p_item_id and client_id = auth.uid();
end $$;
revoke all on function public.set_cart_item_notes(uuid, text) from public, anon;
grant execute on function public.set_cart_item_notes(uuid, text) to authenticated;

create or replace function public.fill_checkout_item_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select case when new.made_to_order then item.customer_notes end into new.customer_notes
    from public.cart_items item join public.checkouts c on c.client_id = item.client_id
    where c.id = new.checkout_id and item.product_id = new.product_id;
  select public.text_summary(product.description, 280) into new.product_summary
    from public.products product where product.id = new.product_id;
  return new;
end $$;
drop trigger if exists fill_checkout_item_context on public.checkout_items;
create trigger fill_checkout_item_context before insert on public.checkout_items
  for each row execute function public.fill_checkout_item_context();

create or replace function public.fill_order_item_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select ci.customer_notes, ci.product_summary into new.customer_notes, new.product_summary
    from public.checkout_items ci join public.orders o on o.checkout_id = ci.checkout_id
    where o.id = new.order_id and ci.product_id = new.product_id;
  return new;
end $$;
drop trigger if exists fill_order_item_context on public.order_items;
create trigger fill_order_item_context before insert on public.order_items
  for each row execute function public.fill_order_item_context();

drop function if exists public.list_cart();
create function public.list_cart()
returns table (
  item_id uuid, product_id uuid, product_name text, store_name text,
  unit_price numeric, quantity integer, stock integer,
  product_active boolean, added_at timestamptz,
  image_url text, artisan_id uuid, availability text, max_quantity integer,
  product_summary text, customer_notes text
)
language sql stable security definer set search_path = '' as $$
  select item.id, item.product_id, product.name,
         coalesce(profile.store_name, profile.full_name), item.unit_price,
         item.quantity, product.stock,
         product.active and public.is_public_artisan(product.artisan_id),
         item.created_at, product.image_url, item.artisan_id,
         product.availability, public.product_max_quantity(product),
         public.text_summary(product.description, 160), item.customer_notes
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles profile on profile.id = item.artisan_id
  where item.client_id = auth.uid()
  order by item.created_at desc;
$$;
revoke all on function public.list_cart() from public, anon;
grant execute on function public.list_cart() to authenticated;

-- Itens dos pedidos de quem compra ou vende (observações, resumo, encomenda).
create or replace function public.list_order_item_details(p_order_ids uuid[])
returns table (
  order_id uuid, item_id uuid, product_id uuid, product_name text, quantity integer,
  made_to_order boolean, customer_notes text, product_summary text
)
language sql stable security definer set search_path = '' as $$
  select i.order_id, i.id, i.product_id, i.product_name, i.quantity,
    i.made_to_order, i.customer_notes, i.product_summary
  from public.order_items i join public.orders o on o.id = i.order_id
  where i.order_id = any(p_order_ids[1:200]) and auth.uid() in (o.client_id, o.artisan_id)
  order by i.order_id, i.product_name;
$$;
revoke all on function public.list_order_item_details(uuid[]) from public, anon;
grant execute on function public.list_order_item_details(uuid[]) to authenticated;

commit;
