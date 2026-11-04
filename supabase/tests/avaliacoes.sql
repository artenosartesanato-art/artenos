-- Teste das avaliações (rodar SOMENTE em banco local de teste, depois das
-- migrações de 20261029). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000101', 'loja-aval@teste.local'),
  ('00000000-0000-0000-0000-000000000102', 'cliente-aval@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-000000000101','artisan','active','Loja Aval','loja-aval@teste.local','88888888888','17999990008','15086426','Rua A','1','Rio Preto','SP','Loja Aval',now()),
  ('00000000-0000-0000-0000-000000000102','client','active','Maria Souza','cliente-aval@teste.local','99999999999','17999990009','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.products(id, artisan_id, name, price, active, stock) values
  ('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000101','Tapete',80,true,5);
insert into public.platform_pricing_settings(id, platform_fee_percent) values (1, 10)
  on conflict (id) do update set platform_fee_percent = 10;

-- Compra paga (caminho real: carrinho → checkout → finalização).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
do $$
declare c uuid;
begin
  perform public.add_to_cart('00000000-0000-0000-0000-000000000111', 1);
  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values ('00000000-0000-0000-0000-000000000121', auth.uid(), '00000000-0000-0000-0000-000000000101', '01001000',
    public.current_cart_shipping_signature(auth.uid(), '00000000-0000-0000-0000-000000000101', '01001000'), 1, 'PAC', 'Correios', 10, 1, 3, 0, 1, 3);
  insert into public.cart_shipping_selections(client_id, artisan_id, quote_id)
    values (auth.uid(), '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000121');
  c := public.create_checkout_from_cart();
  perform public.begin_checkout_payment(c);
  perform public.finalize_checkout(c, 'mp-aval-1', 'pix', 0, 10, 0);
end $$;

do $$
declare v_item uuid; v_order uuid; failed boolean := false; r uuid;
begin
  select i.id, i.order_id into v_item, v_order from public.order_items i join public.orders o on o.id = i.order_id
    where o.client_id = auth.uid() limit 1;
  begin perform public.submit_product_review(v_item, 5, 'Lindo'); exception when others then failed := true; end;
  assert failed, 'só avalia pedido entregue';

  update public.orders set status = 'delivered' where id = v_order;
  assert (select delivered_at is not null from public.orders where id = v_order), 'data de entrega';

  r := public.submit_product_review(v_item, 4, 'Muito bonito, chegou rápido.');
  perform public.submit_store_review(v_order, 5, 'Atendimento ótimo');
  assert (select rating_avg = 4 and rating_count = 1 from public.products where id = '00000000-0000-0000-0000-000000000111'), 'média da peça';
  assert (select rating_avg = 5 and rating_count = 1 from public.artisan_store_settings where artisan_id = '00000000-0000-0000-0000-000000000101'), 'média da loja';

  perform public.submit_product_review(v_item, 2, 'Mudei de ideia');
  assert (select count(*) from public.product_reviews where order_item_id = v_item) = 1, 'edição não duplica';
  assert (select rating_avg from public.products where id = '00000000-0000-0000-0000-000000000111') = 2, 'média atualizada';

  failed := false;
  begin perform public.submit_product_review(v_item, 1, 'loja de merda'); exception when check_violation then failed := true; end;
  assert failed, 'comentário passa pelo filtro';

  assert (select author_name from public.list_product_reviews('00000000-0000-0000-0000-000000000111')) = 'Maria', 'só o primeiro nome';
  assert (select count(*) from public.list_my_reviewables()) = 1, 'item avaliável';

  -- Loja responde uma única vez.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
  perform public.reply_to_review('product', r, 'Obrigada pelo retorno!');
  failed := false;
  begin perform public.reply_to_review('product', r, 'De novo'); exception when others then failed := true; end;
  assert failed, 'uma resposta por avaliação';
  assert (select count(*) from public.list_my_received_reviews()) = 2, 'painel da loja';
  assert (select rating_count from public.browse_storefront_products(p_sort => 'rating') limit 1) is not null, 'ordenação por avaliação';
end $$;

-- Lembrete: entregue há mais de 3 dias e sem avaliação da loja.
delete from public.store_reviews where artisan_id = '00000000-0000-0000-0000-000000000101';
update public.orders set delivered_at = now() - interval '4 days' where client_id = '00000000-0000-0000-0000-000000000102';
do $$
begin
  assert (select count(*) from public.claim_review_reminders(10) where client_id = '00000000-0000-0000-0000-000000000102') = 1, 'lembrete';
  assert (select count(*) from public.claim_review_reminders(10) where client_id = '00000000-0000-0000-0000-000000000102') = 0, 'lembrete uma vez';
end $$;

select 'ok: avaliacoes' as resultado;
rollback;
