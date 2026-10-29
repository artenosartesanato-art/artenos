-- Teste da regra de disponibilidade (rodar SOMENTE num banco local de teste,
-- ex.: o sandbox de docs/redesign/sandbox, depois das migrações de 20261029).
-- Uso: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/disponibilidade_estoque.sql
-- Tudo roda dentro de uma transação desfeita no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'loja-aceita@teste.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'loja-nao-aceita@teste.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'cliente@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-0000000000a1','artisan','active','Loja A','loja-aceita@teste.local','11111111111','17999990001','15086426','Rua A','1','Rio Preto','SP','Loja A',now()),
  ('00000000-0000-0000-0000-0000000000a2','artisan','active','Loja B','loja-nao-aceita@teste.local','22222222222','17999990002','15086426','Rua B','2','Rio Preto','SP','Loja B',now()),
  ('00000000-0000-0000-0000-0000000000c1','client','active','Cliente','cliente@teste.local','33333333333','17999990003','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.artisan_store_settings(artisan_id, accepts_custom_orders) values
  ('00000000-0000-0000-0000-0000000000a1', true),
  ('00000000-0000-0000-0000-0000000000a2', false);

insert into public.products(id, artisan_id, name, price, active, stock, ready_to_ship) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Com estoque',30,true,2,false),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Sem estoque, aceita',30,true,0,true),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a2','Sem estoque, não aceita',30,true,null,true);

do $$
declare v text;
begin
  select availability into v from public.products where id='00000000-0000-0000-0000-000000000001';
  assert v = 'ready', 'estoque > 0 deveria ser pronta entrega, veio ' || v;
  assert (select ready_to_ship from public.products where id='00000000-0000-0000-0000-000000000001'), 'ready_to_ship deveria seguir o estoque';
  select availability into v from public.products where id='00000000-0000-0000-0000-000000000002';
  assert v = 'made_to_order', 'estoque 0 com encomenda deveria ser sob encomenda, veio ' || v;
  assert not (select ready_to_ship from public.products where id='00000000-0000-0000-0000-000000000002'), 'ready_to_ship manual deveria ser ignorado';
  select availability into v from public.products where id='00000000-0000-0000-0000-000000000003';
  assert v = 'sold_out', 'estoque vazio sem encomenda deveria ser esgotado, veio ' || v;

  -- Loja passa a aceitar encomendas: a peça sem estoque vira sob encomenda.
  update public.artisan_store_settings set accepts_custom_orders = true where artisan_id='00000000-0000-0000-0000-0000000000a2';
  assert (select availability from public.products where id='00000000-0000-0000-0000-000000000003') = 'made_to_order', 'deveria recalcular ao aceitar encomendas';
  update public.artisan_store_settings set accepts_custom_orders = false where artisan_id='00000000-0000-0000-0000-0000000000a2';
  assert (select availability from public.products where id='00000000-0000-0000-0000-000000000003') = 'sold_out', 'deveria recalcular ao recusar encomendas';
end $$;

-- Carrinho e checkout como a cliente.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$
declare failed boolean;
begin
  perform public.add_to_cart('00000000-0000-0000-0000-000000000001', 2);
  failed := false;
  begin perform public.add_to_cart('00000000-0000-0000-0000-000000000001', 1);
  exception when others then failed := true; end;
  assert failed, 'não deveria passar do estoque a pronta entrega';
  perform public.add_to_cart('00000000-0000-0000-0000-000000000002', 5);
  failed := false;
  begin perform public.add_to_cart('00000000-0000-0000-0000-000000000003', 1);
  exception when others then failed := true; end;
  assert failed, 'peça esgotada não deveria entrar no carrinho';
end $$;

-- Frete válido para a loja A (o checkout exige um por loja).
insert into public.platform_pricing_settings(id, platform_fee_percent) values (1, 10)
  on conflict (id) do update set platform_fee_percent = 10;
insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
  carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','01001000',
  public.current_cart_shipping_signature('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','01001000'),
  1,'PAC','Correios',20,1,3,2,3,5);
insert into public.cart_shipping_selections(client_id, artisan_id, quote_id)
values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f1');

do $$
declare c uuid; v record;
begin
  c := public.create_checkout_from_cart();
  -- A compra zera o estoque: a peça vira sob encomenda (a loja A aceita).
  select stock, availability into v from public.products where id='00000000-0000-0000-0000-000000000001';
  assert v.stock = 0 and v.availability = 'made_to_order', format('compra que zera o estoque: %s/%s', v.stock, v.availability);
  assert (select stock_reserved and not made_to_order from public.checkout_items where checkout_id=c and product_id='00000000-0000-0000-0000-000000000001'), 'pronta entrega deveria reservar';
  assert (select not stock_reserved and made_to_order from public.checkout_items where checkout_id=c and product_id='00000000-0000-0000-0000-000000000002'), 'sob encomenda não deveria reservar';
  assert (select stock from public.products where id='00000000-0000-0000-0000-000000000002') = 0, 'sob encomenda não mexe no estoque';

  -- Cancelamento devolve o estoque e a peça volta a pronta entrega.
  perform public.cancel_reserved_checkout(c, false);
  select stock, availability into v from public.products where id='00000000-0000-0000-0000-000000000001';
  assert v.stock = 2 and v.availability = 'ready', format('cancelamento: %s/%s', v.stock, v.availability);
end $$;

-- Pagamento aprovado: pedido criado com o item sob encomenda marcado.
do $$
declare c uuid;
begin
  c := public.create_checkout_from_cart();
  perform public.begin_checkout_payment(c);
  perform public.finalize_checkout(c, 'mp-teste-1', 'pix', 0, 10, 0);
  assert (select made_to_order from public.order_items oi join public.orders o on o.id = oi.order_id
          where o.checkout_id = c and oi.product_id = '00000000-0000-0000-0000-000000000002'), 'order_items.made_to_order';
  assert not (select made_to_order from public.order_items oi join public.orders o on o.id = oi.order_id
          where o.checkout_id = c and oi.product_id = '00000000-0000-0000-0000-000000000001'), 'pronta entrega não é encomenda';
end $$;

select 'ok: disponibilidade_estoque' as resultado;
rollback;
