-- Teste da fila de nota fiscal (rodar SOMENTE em banco local de teste, depois
-- das migrações de 20261029). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000401', 'loja-nf@teste.local'),
  ('00000000-0000-0000-0000-000000000402', 'cliente-nf@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000402');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-000000000401','artisan','active','Loja NF','loja-nf@teste.local','11122233344','17999990014','15086426','Rua A','1','Rio Preto','SP','Loja NF',now()),
  ('00000000-0000-0000-0000-000000000402','client','active','Caio Dias','cliente-nf@teste.local','44433322211','17999990015','01001000','Rua C','3','São Paulo','SP',null,now());

do $$
declare j record; failed boolean := false; c jsonb;
begin
  insert into public.orders(id, client_id, artisan_id, product_name, status, payment_status, subtotal, shipping_amount, total_amount)
    values ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000401', 'Vaso', 'payment_confirmed', 'paid', 50, 10, 60);
  assert (select count(*) from public.invoice_jobs where order_id = '00000000-0000-0000-0000-000000000411') = 1, 'pedido pago entra na fila';
  assert (select nf_status from public.orders where id = '00000000-0000-0000-0000-000000000411') = 'pendente', 'status pendente';
  update public.orders set payment_status = 'paid' where id = '00000000-0000-0000-0000-000000000411';
  assert (select count(*) from public.invoice_jobs) >= 1 and (select count(*) from public.invoice_jobs where order_id = '00000000-0000-0000-0000-000000000411') = 1, 'idempotente';

  select * into j from public.claim_invoice_jobs(10) where order_id = '00000000-0000-0000-0000-000000000411';
  assert j.attempts = 1 and j.status = 'processing', 'job reservado';
  assert (select count(*) from public.claim_invoice_jobs(10) where order_id = '00000000-0000-0000-0000-000000000411') = 0, 'não reserva duas vezes';
  c := public.invoice_context('00000000-0000-0000-0000-000000000411');
  assert c->'buyer'->>'document' = '44433322211', 'contexto';

  perform public.finish_invoice_job('00000000-0000-0000-0000-000000000411', 'error', p_error => 'emissor fora do ar');
  assert (select status = 'pending' and next_attempt_at > now() from public.invoice_jobs where order_id = '00000000-0000-0000-0000-000000000411'), 'retentativa agendada';
  perform public.finish_invoice_job('00000000-0000-0000-0000-000000000411', 'issued', '123', 'https://nf/123.pdf', '<xml/>', 'prov-1');
  assert (select nf_status = 'emitida' and nf_numero = '123' from public.orders where id = '00000000-0000-0000-0000-000000000411'), 'emitida';
  perform public.finish_invoice_job('00000000-0000-0000-0000-000000000411', 'issued', '999');
  assert (select nf_numero from public.orders where id = '00000000-0000-0000-0000-000000000411') = '123', 'não emite duas notas';

  -- Nota obrigatória: peça sem dados fiscais não é publicada.
  update public.invoice_settings set required = true where id = 1;
  begin
    insert into public.products(artisan_id, name, price, active, stock) values ('00000000-0000-0000-0000-000000000401', 'Sem NCM', 10, true, 1);
  exception when check_violation then failed := true; end;
  assert failed, 'exige dados fiscais';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
  perform public.save_my_fiscal_profile('{"person_type":"pf","document":"111.222.333-44","legal_name":"Loja NF","tax_regime":"mei","cep":"15086-426","street":"Rua A","number":"1","district":"Centro","city":"Rio Preto","state":"sp"}');
  insert into public.products(artisan_id, name, price, active, stock, ncm, cfop) values ('00000000-0000-0000-0000-000000000401', 'Com NCM', 10, true, 1, '69139000', '5102');
end $$;

select 'ok: notas_fiscais' as resultado;
rollback;
