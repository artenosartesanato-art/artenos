-- Teste da tarifa fixa por item (rodar SOMENTE em banco local de teste, depois
-- de migrations/20261115_tarifa_por_item.sql). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000001e1', 'loja-tarifa@teste.local'),
  ('00000000-0000-0000-0000-0000000001e2', 'cliente-tarifa@teste.local'),
  ('00000000-0000-0000-0000-0000000001e3', 'dona-tarifa@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000001e1','00000000-0000-0000-0000-0000000001e2');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at, birth_date)
values
  ('00000000-0000-0000-0000-0000000001e1','artisan','active','Loja Tarifa','loja-tarifa@teste.local','11144477735','17999990041','15086426','Rua A','1','Rio Preto','SP','Loja Tarifa',now(),'1990-01-01'),
  ('00000000-0000-0000-0000-0000000001e2','client','active','Cliente Tarifa','cliente-tarifa@teste.local','52998224725','17999990042','01001000','Rua C','3','São Paulo','SP',null,now(),null);
insert into public.admin_users(user_id, role) values ('00000000-0000-0000-0000-0000000001e3', 'owner');
insert into public.artisan_store_settings(artisan_id, accepts_custom_orders) values ('00000000-0000-0000-0000-0000000001e1', true)
  on conflict do nothing;
insert into public.products(id, artisan_id, name, price, active, stock, description) values
  ('00000000-0000-0000-0000-0000000001f1','00000000-0000-0000-0000-0000000001e1','Vaso',50,true,5,'Vaso'),
  ('00000000-0000-0000-0000-0000000001f2','00000000-0000-0000-0000-0000000001e1','Chaveiro',3,true,5,'Chaveiro');
update public.platform_pricing_settings
   set platform_fee_percent = 8, payment_fee_pix_percent = 0.99, payment_fee_card_percent = 4.98, item_fee_amount = 4
 where id = 1;

do $$
declare v_id uuid; r record; failed boolean; q uuid; c uuid;
begin
  -- Configuração: leitura e só a proprietária altera.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001e1', true);
  assert (select amount from public.get_item_fee_settings()) = 4, 'valor padrão';
  failed := false;
  begin perform public.admin_update_item_fee(5); exception when others then failed := true; end;
  assert failed, 'loja não altera a tarifa por item';

  -- Calculadora: custo 60 + lucro 40% (24) + tarifa 4 = 88; cartão: 88 / (1 - 0,1298) = 101,13.
  v_id := public.save_pricing_calculation('Bolsa', 30, 2, 15, 0, 0, 40, null, 'card');
  select * into r from public.list_my_pricing_calculations(5) where id = v_id;
  assert r.suggested_price = 101.13 and r.item_fee_amount = 4, 'preço com tarifa por item: ' || r.suggested_price;
  assert r.desired_profit = 24, 'a margem não incide sobre a tarifa';
  -- Cálculo vazio continua em zero.
  v_id := public.save_pricing_calculation('Vazio', 0, 0, 0, 0, 0, 0, null, 'card');
  select * into r from public.list_my_pricing_calculations(5) where id = v_id;
  assert r.suggested_price = 0 and r.item_fee_amount = 0, 'sem custo de produção';

  -- Compra: 2 vasos de 50 (+ frete 15). Tarifa = 8% de 100 + 2 × 4 = 16.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001e2', true);
  perform public.start_buy_now('00000000-0000-0000-0000-0000000001f1', 2);
  q := gen_random_uuid();
  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values (q, auth.uid(), '00000000-0000-0000-0000-0000000001e1', '01001000',
    public.current_buy_now_signature(auth.uid(), '00000000-0000-0000-0000-0000000001e1', '01001000'), 1, 'PAC', 'Correios', 15, 1, 3, 0, 1, 3);
  c := public.create_checkout_from_item(q);
  assert (select item_fee_amount from public.checkouts where id = c) = 4, 'valor congelado na compra';
  -- Mudar a tarifa depois não altera a compra já criada.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001e3', true);
  assert public.admin_update_item_fee(6) = 6, 'proprietária altera';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001e2', true);
  perform public.begin_checkout_payment(c);
  perform public.finalize_checkout(c, 'mp-tarifa-1', 'pix', 1.14, 8, 0);
  select * into r from public.orders where checkout_id = c;
  assert r.platform_fee_amount = 16 and r.item_fee_amount = 8 and r.item_fee_unit_amount = 4, 'tarifa retida: ' || r.platform_fee_amount;
  -- Repasse = 115 - 16 - 1,14 (Mercado Pago) = 97,86.
  assert r.artisan_net_amount = 97.86, 'líquido da loja: ' || r.artisan_net_amount;
  select * into r from public.payouts where checkout_id = c;
  assert r.platform_fee = 16 and r.item_fee = 8 and r.net_amount = 97.86, 'repasse automático já líquido';

  -- Peça mais barata que a tarifa: a tarifa para no valor das peças (frete fica com a loja).
  perform public.start_buy_now('00000000-0000-0000-0000-0000000001f2', 1);
  q := gen_random_uuid();
  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values (q, auth.uid(), '00000000-0000-0000-0000-0000000001e1', '01001000',
    public.current_buy_now_signature(auth.uid(), '00000000-0000-0000-0000-0000000001e1', '01001000'), 1, 'PAC', 'Correios', 15, 1, 3, 0, 1, 3);
  c := public.create_checkout_from_item(q);
  assert (select item_fee_amount from public.checkouts where id = c) = 6, 'nova compra usa o valor novo';
  perform public.begin_checkout_payment(c);
  perform public.finalize_checkout(c, 'mp-tarifa-2', 'pix', 0, 8, 0);
  select * into r from public.orders where checkout_id = c;
  assert r.platform_fee_amount = 3 and r.item_fee_amount = 2.76, 'tarifa limitada ao valor da peça: ' || r.platform_fee_amount;
  assert r.artisan_net_amount = 15, 'frete inteiro para a loja';
end $$;

select 'ok: tarifa_por_item' as resultado;
rollback;
