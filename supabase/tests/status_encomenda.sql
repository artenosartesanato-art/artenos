-- Teste do status de produção de itens sob encomenda (rodar SOMENTE em banco
-- local de teste, depois das migrações de 20261029). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000201', 'loja-status@teste.local'),
  ('00000000-0000-0000-0000-000000000202', 'cliente-status@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000202');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-000000000201','artisan','active','Loja Status','loja-status@teste.local','12312312312','17999990010','15086426','Rua A','1','Rio Preto','SP','Loja Status',now()),
  ('00000000-0000-0000-0000-000000000202','client','active','Ana Lima','cliente-status@teste.local','32132132132','17999990011','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.artisan_store_settings(artisan_id, accepts_custom_orders) values ('00000000-0000-0000-0000-000000000201', true);
insert into public.products(id, artisan_id, name, price, active, stock) values
  ('00000000-0000-0000-0000-000000000211','00000000-0000-0000-0000-000000000201','Quadro bordado',120,true,0);
insert into public.platform_pricing_settings(id, platform_fee_percent) values (1, 10)
  on conflict (id) do update set platform_fee_percent = 10;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
do $$
declare c uuid;
begin
  assert (select count(*) from public.browse_storefront_products(p_availability => 'made_to_order')
          where id = '00000000-0000-0000-0000-000000000211') = 1, 'filtro só sob encomenda';
  perform public.add_to_cart('00000000-0000-0000-0000-000000000211', 1);
  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values ('00000000-0000-0000-0000-000000000221', auth.uid(), '00000000-0000-0000-0000-000000000201', '01001000',
    public.current_cart_shipping_signature(auth.uid(), '00000000-0000-0000-0000-000000000201', '01001000'), 1, 'PAC', 'Correios', 10, 1, 3, 5, 6, 8);
  insert into public.cart_shipping_selections(client_id, artisan_id, quote_id)
    values (auth.uid(), '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000221');
  c := public.create_checkout_from_cart();
  perform public.begin_checkout_payment(c);
  perform public.finalize_checkout(c, 'mp-status-1', 'pix', 0, 10, 0);
  assert (select production_status from public.list_my_open_custom_orders()) = 'awaiting_confirmation', 'começa aguardando a loja';
end $$;

do $$
declare v_item uuid; failed boolean := false;
begin
  select i.id into v_item from public.order_items i join public.orders o on o.id = i.order_id where o.client_id = auth.uid();
  begin perform public.update_order_item_production(v_item, 'in_production'); exception when others then failed := true; end;
  assert failed, 'comprador não muda o status';

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
  perform public.update_order_item_production(v_item, 'in_production');
  perform public.update_order_item_production(v_item, 'ready_to_ship');
  failed := false;
  begin perform public.update_order_item_production(v_item, 'awaiting_confirmation'); exception when others then failed := true; end;
  assert failed, 'não volta duas etapas';
  assert exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000202' and kind = 'pedido'), 'avisa quem comprou';
  assert (select production_status from public.list_order_item_details(array[(select order_id from public.order_items where id = v_item)])) = 'ready_to_ship', 'detalhes do item';
end $$;

select 'ok: status_encomenda' as resultado;
rollback;
