-- Teste da taxa do Mercado Pago na calculadora (rodar SOMENTE em banco local
-- de teste, depois de migrations/20261111_taxa_pagamento_calculadora.sql).
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000d7', 'loja-preco@teste.local'),
  ('00000000-0000-0000-0000-0000000000d8', 'dona-preco@teste.local');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values ('00000000-0000-0000-0000-0000000000d7','artisan','active','Loja Preço','loja-preco@teste.local','45645645645','17999990012','15086426','Rua A','1','Rio Preto','SP','Loja Preço',now());
insert into public.admin_users(user_id, role) values ('00000000-0000-0000-0000-0000000000d8', 'owner');
update public.platform_pricing_settings set platform_fee_percent = 8, payment_fee_pix_percent = 0.99, payment_fee_card_percent = 4.98 where id = 1;

do $$
declare v_id uuid; r record; failed boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d7', true);
  -- Custo 60 + lucro 40% (24) = 84. Cartão: 84 / (1 - 0,1298) = 96,53.
  v_id := public.save_pricing_calculation('Bolsa', 30, 2, 15, 0, 0, 40, null, 'card');
  select * into r from public.list_my_pricing_calculations(5) where id = v_id;
  assert r.suggested_price = 96.53, 'preço com cartão: ' || r.suggested_price;
  assert r.platform_fee_amount = 7.72 and r.payment_fee_amount = 4.81, 'valores das taxas: ' || r.platform_fee_amount || ' / ' || r.payment_fee_amount;
  assert r.payment_method = 'card' and r.payment_fee_percent = 4.98, 'meio e taxa';
  -- Pix: 84 / (1 - 0,0899) = 92,30.
  assert public.update_my_pricing_calculation(v_id, 'Bolsa', 30, 2, 15, 0, 0, 40, null, 'pix'), 'editar';
  select * into r from public.list_my_pricing_calculations(5) where id = v_id;
  assert r.suggested_price = 92.30 and r.payment_fee_amount = 0.91, 'preço com Pix: ' || r.suggested_price || ' / ' || r.payment_fee_amount;
  -- Sem informar o meio: cartão (o mais seguro).
  v_id := public.save_pricing_calculation('Vaso', 10, 0, 0, 0, 0, 0);
  assert (select payment_method from public.list_my_pricing_calculations(5) where id = v_id) = 'card', 'padrão cartão';
  -- Meio inválido.
  begin perform public.save_pricing_calculation('X', 1, 0, 0, 0, 0, 0, null, 'boleto');
  exception when others then failed := true; end;
  assert failed, 'meio inválido';

  -- Só a proprietária muda as taxas.
  failed := false;
  begin perform public.admin_update_payment_fees(1, 5);
  exception when others then failed := true; end;
  assert failed, 'loja não altera taxas';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d8', true);
  perform public.admin_update_payment_fees(1.19, 4.49);
  assert (select card_percent from public.get_payment_fee_settings()) = 4.49, 'taxa atualizada';
end $$;

select 'ok: taxa_pagamento_calculadora' as resultado;
rollback;
