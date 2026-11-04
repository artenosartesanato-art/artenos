-- Regressão: "O frete expirou" ao tentar pagar de novo (rodar SOMENTE em banco
-- local de teste, depois de 20261105_frete_assinatura.sql). Tudo é desfeito.
-- Cenário: a pessoa abre o pagamento, volta sem pagar, recalcula o frete e
-- tenta pagar. A compra aberta é cancelada (o estoque volta) ANTES de conferir
-- o frete; se a assinatura usasse a data de alteração da peça, ela mudava aí e
-- o frete recém-calculado era recusado, sem fim.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000b01', 'loja-frete@teste.local'),
  ('00000000-0000-0000-0000-000000000b02', 'cliente-frete@teste.local');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-000000000b01','artisan','active','Loja Frete','loja-frete@teste.local','81881881881','17999990081','15086426','Rua A','1','Rio Preto','SP','Loja Frete',now()),
  ('00000000-0000-0000-0000-000000000b02','client','active','Cliente Frete','cliente-frete@teste.local','91991991991','17999990082','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.artisan_store_settings(artisan_id, accepts_custom_orders) values ('00000000-0000-0000-0000-000000000b01', true);
insert into public.products(id, artisan_id, name, price, active, stock) values
  ('00000000-0000-0000-0000-000000000b11','00000000-0000-0000-0000-000000000b01','Copo',30,true,19);
insert into public.platform_pricing_settings(id, platform_fee_percent) values (1, 10)
  on conflict (id) do update set platform_fee_percent = 10;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b02', true);

create function pg_temp.quote() returns uuid language plpgsql as $$
declare q uuid := gen_random_uuid();
begin
  insert into public.shipping_quotes(id, client_id, artisan_id, destination_cep, cart_signature, service_id, service_name, company_name, price,
    carrier_delivery_min_days, carrier_delivery_max_days, production_time_days, total_delivery_min_days, total_delivery_max_days)
  values (q, auth.uid(), '00000000-0000-0000-0000-000000000b01', '01001000',
    public.current_buy_now_signature(auth.uid(), '00000000-0000-0000-0000-000000000b01', '01001000'), 1, 'SEDEX', 'Correios', 10.4, 1, 2, 2, 3, 4);
  return q;
end $$;

do $$
declare first_checkout uuid; second_checkout uuid; failed text;
begin
  perform public.start_buy_now('00000000-0000-0000-0000-000000000b11', 1);
  first_checkout := public.create_checkout_from_item(pg_temp.quote());   -- abriu o pagamento e voltou
  -- Em produção cada passo é uma transação (a reserva aconteceu antes); aqui,
  -- dentro de uma só, now() não muda: recua a data da reserva em 1 minuto.
  update public.products set updated_at = updated_at - interval '1 minute' where id = '00000000-0000-0000-0000-000000000b11';
  begin
    second_checkout := public.create_checkout_from_item(pg_temp.quote()); -- frete novo, tenta pagar de novo
  exception when others then failed := sqlerrm; end;
  assert failed is null, 'não pode recusar o frete recém-calculado: ' || coalesce(failed, '');
  assert (select status from public.checkouts where id = first_checkout) not in ('pending', 'awaiting_payment'), 'a compra aberta anterior foi liberada';
  assert (select stock from public.products where id = '00000000-0000-0000-0000-000000000b11') = 18, 'estoque reservado só uma vez';
end $$;

select 'frete_compra_aberta: ok' as resultado;
rollback;
