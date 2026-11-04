-- Exclusão em duas etapas (rodar SOMENTE em banco local de teste, depois da
-- migração 20261031_exclusao_30_dias.sql). Tudo é desfeito no final.
begin;
set local client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000401', 'loja-exc@teste.local'),
  ('00000000-0000-0000-0000-000000000402', 'cliente-exc@teste.local'),
  ('00000000-0000-0000-0000-000000000403', 'admin-exc@teste.local');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, story, terms_accepted_at)
values
  ('00000000-0000-0000-0000-000000000401','artisan','active','Loja Exc','loja-exc@teste.local','11122233344','17999990021','15086426','Rua A','1','Rio Preto','SP','Loja Exc','Faço peças de crochê com linhas de algodão há dez anos, cada uma com muito cuidado.',now()),
  ('00000000-0000-0000-0000-000000000402','client','active','Caio Lima','cliente-exc@teste.local','55566677788','17999990022','01001000','Rua C','3','São Paulo','SP',null,null,now());
insert into public.admin_users(user_id, role) values ('00000000-0000-0000-0000-000000000403', 'owner');
insert into public.products(id, artisan_id, name, price, active, stock) values
  ('00000000-0000-0000-0000-000000000411','00000000-0000-0000-0000-000000000401','Bolsa',90,true,2);
insert into public.conversations(id, client_id, artisan_id, product_name_snapshot)
  values ('00000000-0000-0000-0000-000000000412','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000401','Bolsa');

-- 1) Com pedido em andamento, o pedido de exclusão é recusado com o motivo.
insert into public.orders(id, client_id, artisan_id, product_name, status)
  values ('00000000-0000-0000-0000-000000000413','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000401','Bolsa','payment_confirmed');
do $$
declare failed text;
begin
  begin perform public.request_account_deletion('00000000-0000-0000-0000-000000000402');
  exception when others then failed := sqlerrm; end;
  assert failed like 'EXCLUSAO:%pedidos em andamento%', 'pendência bloqueia: ' || coalesce(failed, '(nenhum erro)');
  assert (select account_status from public.profiles where id = '00000000-0000-0000-0000-000000000402') = 'active', 'conta continua ativa';
end $$;
update public.orders set status = 'delivered' where id = '00000000-0000-0000-0000-000000000413';

-- 2) Sem pendências: desativa na hora, agenda para +30 dias e tira a loja da vitrine.
do $$
declare v_when timestamptz;
begin
  v_when := public.request_account_deletion('00000000-0000-0000-0000-000000000401', '203.0.113.7');
  assert v_when::date = (now() + interval '30 days')::date, 'data definitiva em 30 dias';
  assert (select account_status from public.profiles where id = '00000000-0000-0000-0000-000000000401') = 'pending_deletion', 'em exclusão';
  assert not (select active from public.products where id = '00000000-0000-0000-0000-000000000411'), 'peça sai da vitrine';
  assert exists (select 1 from public.access_logs where user_id = '00000000-0000-0000-0000-000000000401'
    and event = 'deletion_requested' and ip = '203.0.113.7'), 'auditoria com IP';
  -- Pedido repetido não muda o prazo.
  assert public.request_account_deletion('00000000-0000-0000-0000-000000000401') = v_when, 'prazo não muda';
end $$;

-- 3) Conversa com conta em exclusão não recebe mensagem nova.
do $$
declare failed boolean := false;
begin
  begin
    insert into public.messages(conversation_id, sender_id, body)
      values ('00000000-0000-0000-0000-000000000412', '00000000-0000-0000-0000-000000000402', 'Oi');
  exception when check_violation then failed := true; end;
  assert failed, 'mensagem bloqueada';
end $$;

-- 4) Job no dia 29 não exclui; no dia 30 exclui; rodar de novo não faz nada.
do $$
declare r jsonb;
begin
  r := public.finalize_due_deletions(now() + interval '29 days');
  assert (r->>'processed')::int = 0, 'dia 29: nada';
  r := public.finalize_due_deletions(now() + interval '30 days 1 minute');
  assert (r->>'processed')::int = 1, 'dia 30: exclui ' || r::text;
  assert (select account_status = 'deleted' and full_name = 'Conta excluída' and store_name = 'Loja encerrada'
            from public.profiles where id = '00000000-0000-0000-0000-000000000401'), 'anonimizada e marcada como excluída';
  r := public.finalize_due_deletions(now() + interval '31 days');
  assert (r->>'processed')::int = 0, 'idempotente';
end $$;

-- 5) Reativação pela equipe (dentro dos 30 dias).
select public.request_account_deletion('00000000-0000-0000-0000-000000000402');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
do $$
declare failed boolean := false;
begin
  begin perform public.admin_reactivate_account('00000000-0000-0000-0000-000000000402');
  exception when others then failed := true; end;
  assert failed, 'quem não é da equipe não reativa';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
do $$
begin
  assert (select count(*) from public.admin_list_pending_deletions()) = 1, 'lista da equipe';
  assert (select email from public.admin_reactivate_account('00000000-0000-0000-0000-000000000402')) = 'cliente-exc@teste.local', 'reativa';
  assert (select account_status = 'active' and deletion_scheduled_at is null
            from public.profiles where id = '00000000-0000-0000-0000-000000000402'), 'volta a ativa, sem datas';
  assert (select count(*) from public.admin_list_pending_deletions()) = 0, 'sai da lista';
end $$;

select 'exclusao_30_dias: ok' as resultado;
rollback;
