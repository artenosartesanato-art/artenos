-- Teste da suspensão de conta (rodar SOMENTE em banco local de teste, depois de
-- migrations/20261109_suspensao_conta.sql).
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'loja-susp@teste.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'cliente-susp@teste.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'admin-susp@teste.local');
insert into public.admin_users(user_id, role) values ('00000000-0000-0000-0000-0000000000c3', 'owner');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-0000000000c1','artisan','active','Loja Susp','loja-susp@teste.local','12312312312','17999990010','15086426','Rua A','1','Rio Preto','SP','Loja Susp',now()),
  ('00000000-0000-0000-0000-0000000000c2','client','active','Cliente Susp','cliente-susp@teste.local','32132132132','17999990011','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.products(id, artisan_id, name, description, price, stock, active)
  values ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000c1', 'Peça Susp',
    'Peça de teste com descrição suficiente para passar.', 50, 5, true);
insert into public.conversations(id, client_id, artisan_id, product_name_snapshot)
  values ('00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c1','Peça Susp');
insert into public.conversation_reports(id, conversation_id, reporter_id, reason)
  values ('00000000-0000-0000-0000-0000000000cb','00000000-0000-0000-0000-0000000000ca','00000000-0000-0000-0000-0000000000c1','ofensa');

do $$
declare failed boolean; v_admin uuid;
begin
  v_admin := '00000000-0000-0000-0000-0000000000c3';

  -- Antes: cliente favorita normalmente.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
  insert into public.storefront_favorites(user_id, product_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000c9');
  assert (select count(*) from public.get_my_suspension()) = 0, 'sem suspensão';

  -- Admin suspende o comprador pela denúncia.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_resolve_conversation_report('00000000-0000-0000-0000-0000000000cb', 'resolved', null,
    '00000000-0000-0000-0000-0000000000c2', 7);
  assert exists (select 1 from public.admin_list_suspensions() where user_id = '00000000-0000-0000-0000-0000000000c2'), 'aparece no painel';
  assert exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000c2' and kind = 'conta'), 'aviso enviado';
  -- Suspender de novo: recusado.
  failed := false;
  begin perform public.admin_resolve_conversation_report('00000000-0000-0000-0000-0000000000cb', 'resolved', null,
    '00000000-0000-0000-0000-0000000000c2', 7);
  exception when others then failed := sqlerrm like '%já está suspensa%'; end;
  assert failed, 'não suspende duas vezes';
  -- Só participantes da conversa.
  failed := false;
  begin perform public.admin_resolve_conversation_report('00000000-0000-0000-0000-0000000000cb', 'resolved', null, v_admin, 7);
  exception when others then failed := true; end;
  assert failed, 'só participantes';

  -- Suspenso: vê, mas não movimenta.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
  assert (select count(*) from public.get_my_suspension()) = 1, 'vê a própria suspensão';
  failed := false;
  begin insert into public.cart_items(client_id, product_id, quantity) values (auth.uid(), '00000000-0000-0000-0000-0000000000c9', 1);
  exception when check_violation then failed := sqlerrm like 'Sua conta está suspensa%'; end;
  assert failed, 'carrinho barrado';
  failed := false;
  begin insert into public.messages(conversation_id, sender_id, body) values ('00000000-0000-0000-0000-0000000000ca', auth.uid(), 'Olá');
  exception when check_violation then failed := true; end;
  assert failed, 'mensagem barrada';
  failed := false;
  begin insert into public.conversations(client_id, artisan_id, product_name_snapshot)
    values (auth.uid(), '00000000-0000-0000-0000-0000000000c1', 'Outra');
  exception when check_violation then failed := true; end;
  assert failed, 'nova conversa barrada';
  -- Apagar continua livre (limpezas não quebram a navegação).
  delete from public.storefront_favorites where user_id = auth.uid();

  -- Loja suspensa sai da vitrine.
  assert public.is_public_artisan('00000000-0000-0000-0000-0000000000c1'), 'loja ativa';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_resolve_conversation_report('00000000-0000-0000-0000-0000000000cb', 'resolved', null,
    '00000000-0000-0000-0000-0000000000c1', 7);
  assert not public.is_public_artisan('00000000-0000-0000-0000-0000000000c1'), 'loja suspensa fora da vitrine';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  failed := false;
  begin update public.products set price = 60 where id = '00000000-0000-0000-0000-0000000000c9';
  exception when check_violation then failed := true; end;
  assert failed, 'loja suspensa não edita peças';

  -- Retirar a suspensão devolve tudo.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_lift_suspension('00000000-0000-0000-0000-0000000000c2');
  perform public.admin_lift_suspension('00000000-0000-0000-0000-0000000000c1');
  assert public.is_public_artisan('00000000-0000-0000-0000-0000000000c1'), 'loja volta';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
  insert into public.storefront_favorites(user_id, product_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000c9');
end $$;

select 'ok: suspensao_conta' as resultado;
rollback;
