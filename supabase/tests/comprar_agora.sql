-- Teste do "Comprar agora" (rodar SOMENTE em banco local de teste, depois das
-- migrações de 20261029). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'loja-agora@teste.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'cliente-agora@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-0000000000e1','artisan','active','Loja Agora','loja-agora@teste.local','66666666666','17999990006','15086426','Rua A','1','Rio Preto','SP','Loja Agora',now()),
  ('00000000-0000-0000-0000-0000000000e2','client','active','Cliente Agora','cliente-agora@teste.local','77777777777','17999990007','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.artisan_store_settings(artisan_id, accepts_custom_orders) values ('00000000-0000-0000-0000-0000000000e1', true);
insert into public.products(id, artisan_id, name, price, active, stock, description) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000e1','Vaso',50,true,3,'Vaso de **cerâmica**'),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000e1','Copo',30,true,5,'Copo');
insert into public.platform_pricing_settings(id, platform_fee_percent) values (1, 10)
  on conflict (id) do update set platform_fee_percent = 10;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);

do $$
declare c uuid; q uuid := gen_random_uuid(); cart_before integer;
begin
  perform public.add_to_cart('00000000-0000-0000-0000-0000000000f2', 1);
  select count(*) into cart_before from public.cart_items where client_id = auth.uid();

  perform public.start_buy_now('00000000-0000-0000-0000-0000000000f1', 2);
  assert (select quantity from public.get_buy_now()) = 2, 'intenção guardada';
  assert (select count(*) from public.get_cart_shipping_packages('01001000', 'buy_now')) = 1, 'frete só da peça';
  assert (select count(*) from public.get_cart_shipping_packages('01001000')) = 1, 'carrinho continua com o próprio item';

  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values (q, auth.uid(), '00000000-0000-0000-0000-0000000000e1', '01001000',
    public.current_buy_now_signature(auth.uid(), '00000000-0000-0000-0000-0000000000e1', '01001000'), 1, 'PAC', 'Correios', 15, 1, 3, 0, 1, 3);

  c := public.create_checkout_from_item(q);
  assert (select source from public.checkouts where id = c) = 'buy_now', 'origem';
  assert (select total_amount from public.checkouts where id = c) = 115, 'total = 2 × 50 + 15';
  assert (select count(*) from public.checkout_items where checkout_id = c) = 1, 'só a peça escolhida';
  assert (select stock from public.products where id = '00000000-0000-0000-0000-0000000000f1') = 1, 'reserva de estoque';
  assert (select count(*) from public.cart_items where client_id = auth.uid()) = cart_before, 'carrinho intacto';

  perform public.begin_checkout_payment(c);
  perform public.finalize_checkout(c, 'mp-agora-1', 'pix', 0, 10, 0);
  assert not exists (select 1 from public.buy_now_intents where client_id = auth.uid()), 'intenção removida';
  assert (select count(*) from public.cart_items where client_id = auth.uid()) = cart_before, 'carrinho intacto após pagar';
  assert (select product_summary from public.order_items oi join public.orders o on o.id = oi.order_id where o.checkout_id = c) = 'Vaso de cerâmica', 'resumo congelado';
end $$;

-- Compra direta não paga dá lugar ao carrinho.
do $$
declare q uuid := gen_random_uuid(); c uuid; c2 uuid;
begin
  perform public.start_buy_now('00000000-0000-0000-0000-0000000000f1', 1);
  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values (q, auth.uid(), '00000000-0000-0000-0000-0000000000e1', '01001000',
    public.current_buy_now_signature(auth.uid(), '00000000-0000-0000-0000-0000000000e1', '01001000'), 1, 'PAC', 'Correios', 15, 1, 3, 0, 1, 3);
  c := public.create_checkout_from_item(q);
  assert (select stock from public.products where id = '00000000-0000-0000-0000-0000000000f1') = 0, 'reservou a última';

  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values ('00000000-0000-0000-0000-0000000000a9', auth.uid(), '00000000-0000-0000-0000-0000000000e1', '01001000',
    public.current_cart_shipping_signature(auth.uid(), '00000000-0000-0000-0000-0000000000e1', '01001000'), 1, 'PAC', 'Correios', 15, 1, 3, 0, 1, 3);
  insert into public.cart_shipping_selections(client_id, artisan_id, quote_id)
    values (auth.uid(), '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a9')
    on conflict (client_id, artisan_id) do update set quote_id = excluded.quote_id;
  c2 := public.create_checkout_from_cart();
  assert c2 <> c, 'carrinho abre outra compra';
  assert (select status from public.checkouts where id = c) = 'cancelled', 'compra direta cancelada';
  assert (select stock from public.products where id = '00000000-0000-0000-0000-0000000000f1') = 1, 'estoque devolvido';
end $$;

select 'ok: comprar_agora' as resultado;
rollback;
