-- Teste de limite de envios e exclusão de conta (rodar SOMENTE em banco local
-- de teste, depois das migrações de 20261029). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000301', 'loja-seg@teste.local'),
  ('00000000-0000-0000-0000-000000000302', 'cliente-seg@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, story, terms_accepted_at)
values
  ('00000000-0000-0000-0000-000000000301','artisan','active','Loja Seg','loja-seg@teste.local','45645645645','17999990012','15086426','Rua A','1','Rio Preto','SP','Loja Seg','Faço peças de crochê com linhas de algodão há dez anos, cada uma com muito cuidado.',now()),
  ('00000000-0000-0000-0000-000000000302','client','active','Bia Costa','cliente-seg@teste.local','65465465465','17999990013','01001000','Rua C','3','São Paulo','SP',null,null,now());
insert into public.conversations(id, client_id, artisan_id, product_name_snapshot)
  values ('00000000-0000-0000-0000-000000000311','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000301','Peça');
insert into public.products(id, artisan_id, name, price, active, stock) values
  ('00000000-0000-0000-0000-000000000312','00000000-0000-0000-0000-000000000301','Bolsa',90,true,2);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
do $$
declare r jsonb; failed boolean := false;
begin
  for i in 1..20 loop
    r := public.send_chat_message('00000000-0000-0000-0000-000000000311', 'Mensagem ' || i);
  end loop;
  begin r := public.send_chat_message('00000000-0000-0000-0000-000000000311', 'Mais uma');
  exception when others then failed := sqlerrm like 'LIMITE:%'; end;
  assert failed, 'limite de 20 mensagens por minuto';
end $$;

do $$
begin
  perform public.add_to_cart('00000000-0000-0000-0000-000000000312', 1);
  insert into public.storefront_favorites(user_id, product_id) values ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000312');
  -- Pedido em andamento impede a exclusão.
  insert into public.orders(id, client_id, artisan_id, product_name, status, payment_status, subtotal, shipping_amount, total_amount)
    values ('00000000-0000-0000-0000-000000000313', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000301', 'Bolsa', 'preparing', 'paid', 90, 10, 100);
  assert cardinality(public.account_deletion_blockers('00000000-0000-0000-0000-000000000302')) = 1, 'bloqueio por pedido';
  update public.orders set status = 'delivered' where id = '00000000-0000-0000-0000-000000000313';

  -- A rota /api/conta/excluir chama com a chave de serviço (sem usuário no JWT).
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.anonymize_account('00000000-0000-0000-0000-000000000302');
  assert (select full_name = 'Conta excluída' and phone = '' and document like 'excluido-%' from public.profiles
          where id = '00000000-0000-0000-0000-000000000302'), 'perfil anonimizado';
  assert not exists (select 1 from public.cart_items where client_id = '00000000-0000-0000-0000-000000000302'), 'carrinho apagado';
  assert not exists (select 1 from public.storefront_favorites where user_id = '00000000-0000-0000-0000-000000000302'), 'favoritos apagados';
  assert exists (select 1 from public.orders where id = '00000000-0000-0000-0000-000000000313'), 'pedido mantido';
  assert exists (select 1 from public.access_logs where user_id = '00000000-0000-0000-0000-000000000302' and event = 'account_deletion'), 'registro da exclusão';

  -- Loja: peças saem da vitrine e a história pode ser apagada.
  update public.orders set status = 'delivered' where artisan_id = '00000000-0000-0000-0000-000000000301';
  perform public.anonymize_account('00000000-0000-0000-0000-000000000301');
  assert (select store_name from public.profiles where id = '00000000-0000-0000-0000-000000000301') = 'Loja encerrada', 'loja encerrada';
  assert not (select active from public.products where id = '00000000-0000-0000-0000-000000000312'), 'peças fora da vitrine';
  assert (public.purge_expired_records() ? 'access_logs'), 'limpeza';
end $$;

select 'ok: seguranca_privacidade' as resultado;
rollback;
