-- Execute uma vez no SQL Editor depois de vitrine_cliente.sql, favoritos.sql,
-- mensagens.sql e pedidos.sql.
-- Corrige favoritos sem expor profiles e aplica controle de estoque no carrinho.
-- Adicionar ao carrinho NAO reserva estoque; a confirmacao ocorre atomicamente
-- no checkout para impedir venda acima do saldo em acessos simultaneos.

begin;

create or replace function public.is_public_artisan(candidate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = candidate_id
      and profile.account_type = 'artisan'
      and profile.approval_status = 'active'
  );
$$;
revoke all on function public.is_public_artisan(uuid) from public;
grant execute on function public.is_public_artisan(uuid) to anon, authenticated;

drop policy if exists "Own favorites insert" on public.storefront_favorites;
create policy "Own favorites insert" on public.storefront_favorites
  for insert to authenticated with check (
    auth.uid() = user_id and exists (
      select 1 from public.products product
      where product.id = product_id and product.active
        and public.is_public_artisan(product.artisan_id)
    )
  );

create or replace function public.add_to_cart(p_product_id uuid, p_quantity integer default 1)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para usar o carrinho'; end if;
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;

  select product.* into v_product from public.products product
  where product.id = p_product_id and product.active
    and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Produto não encontrado ou indisponível'; end if;
  if v_product.stock is not null and v_product.stock < p_quantity then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) disponível(is).', v_product.stock;
  end if;

  insert into public.cart_items as item
    (client_id, product_id, artisan_id, unit_price, quantity)
  values (auth.uid(), v_product.id, v_product.artisan_id, v_product.price, p_quantity)
  on conflict (client_id, product_id) do update
    set quantity = item.quantity + excluded.quantity,
        unit_price = excluded.unit_price,
        updated_at = now()
    where item.quantity + excluded.quantity <= 99
      and (v_product.stock is null or item.quantity + excluded.quantity <= v_product.stock)
  returning item.id into v_id;

  if v_id is null then
    raise exception 'Estoque insuficiente. Você já possui a quantidade máxima disponível no carrinho.';
  end if;
  return v_id;
end;
$$;

create or replace function public.set_cart_quantity(p_item_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_stock integer;
begin
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;
  select product.stock into v_stock
  from public.cart_items item
  join public.products product on product.id = item.product_id
  where item.id = p_item_id and item.client_id = auth.uid() and product.active
    and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Item não encontrado ou produto indisponível'; end if;
  if v_stock is not null and p_quantity > v_stock then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) disponível(is).', v_stock;
  end if;
  update public.cart_items set quantity = p_quantity, updated_at = now()
  where id = p_item_id and client_id = auth.uid();
end;
$$;

drop function if exists public.list_cart();
create function public.list_cart()
returns table (
  item_id uuid, product_id uuid, product_name text, store_name text,
  unit_price numeric, quantity integer, stock integer,
  product_active boolean, added_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select item.id, item.product_id, product.name,
         coalesce(profile.store_name, profile.full_name), item.unit_price,
         item.quantity, product.stock,
         product.active and public.is_public_artisan(product.artisan_id),
         item.created_at
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles profile on profile.id = item.artisan_id
  where item.client_id = auth.uid()
  order by item.created_at desc;
$$;

-- Mantem o checkout de teste existente, agora com validacao e baixa atomica.
-- Em producao, substitua a confirmacao direta pelo backend do provedor de pagamento.
create or replace function public.checkout_cart()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_buyer public.profiles;
  v_item record;
  v_order_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  select profile.* into v_buyer from public.profiles profile
  where profile.id = auth.uid() and profile.approval_status = 'active';
  if not found then raise exception 'Comprador inválido ou inativo'; end if;
  if not exists (select 1 from public.cart_items where client_id = auth.uid()) then
    raise exception 'Seu carrinho está vazio';
  end if;

  -- Ordem fixa de bloqueio evita conflito entre dois checkouts simultaneos.
  perform product.id
  from public.products product
  join public.cart_items item on item.product_id = product.id
  where item.client_id = auth.uid()
  order by product.id
  for update of product;

  for v_item in
    select item.product_id, item.artisan_id, item.unit_price, item.quantity,
           product.name, product.image_url, product.stock, product.active
    from public.cart_items item
    join public.products product on product.id = item.product_id
    where item.client_id = auth.uid()
    order by item.created_at, item.id
  loop
    if not v_item.active or not public.is_public_artisan(v_item.artisan_id) then
      raise exception 'O produto % não está mais disponível', v_item.name;
    end if;
    if v_item.stock is not null and v_item.quantity > v_item.stock then
      raise exception 'Estoque insuficiente para %. Restam % unidade(s).', v_item.name, v_item.stock;
    end if;

    insert into public.orders (
      client_id, artisan_id, product_name, status, payment_status, payment_reference,
      subtotal, shipping_amount, total_amount, recipient_name, shipping_cep,
      shipping_address, shipping_number, shipping_city, shipping_state
    ) values (
      auth.uid(), v_item.artisan_id, v_item.name, 'payment_confirmed', 'paid',
      'cart-test:' || gen_random_uuid()::text,
      v_item.unit_price * v_item.quantity, 0, v_item.unit_price * v_item.quantity,
      v_buyer.full_name, regexp_replace(v_buyer.cep, '\D', '', 'g'),
      v_buyer.address, v_buyer.address_number, v_buyer.city, upper(v_buyer.state)
    ) returning id into v_order_id;

    insert into public.order_items
      (order_id, product_id, product_name, image_url, quantity, unit_price, subtotal)
    values (v_order_id, v_item.product_id, v_item.name, v_item.image_url,
      v_item.quantity, v_item.unit_price, v_item.unit_price * v_item.quantity);
    insert into public.order_status_history (order_id, status, description)
    values (v_order_id, 'payment_confirmed', 'Compra confirmada e enviada para preparação.');
    insert into public.conversations (order_id, client_id, artisan_id)
    values (v_order_id, auth.uid(), v_item.artisan_id)
    on conflict (order_id) do nothing;

    if v_item.stock is not null then
      update public.products set stock = stock - v_item.quantity, updated_at = now()
      where id = v_item.product_id;
    end if;
    v_count := v_count + 1;
  end loop;

  delete from public.cart_items where client_id = auth.uid();
  return v_count;
end;
$$;

revoke execute on function public.add_to_cart(uuid, integer) from public, anon;
revoke execute on function public.set_cart_quantity(uuid, integer) from public, anon;
revoke execute on function public.list_cart() from public, anon;
revoke execute on function public.checkout_cart() from public, anon;
grant execute on function public.add_to_cart(uuid, integer) to authenticated;
grant execute on function public.set_cart_quantity(uuid, integer) to authenticated;
grant execute on function public.list_cart() to authenticated;
grant execute on function public.checkout_cart() to authenticated;

commit;


