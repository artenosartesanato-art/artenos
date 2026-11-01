-- Teste da exclusão de conta de teste (rodar SOMENTE em banco local, depois de supabase/excluir_conta_teste.sql).
begin;
set local client_min_messages = warning;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000e9', 'teste-excluir@teste.local'), ('00000000-0000-0000-0000-0000000000ea', 'pago@teste.local');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, terms_accepted_at)
values ('00000000-0000-0000-0000-0000000000e9','client','active','Teste Excluir','teste-excluir@teste.local','14714714714','17999990013','01001000','Rua C','3','São Paulo','SP',now()),
       ('00000000-0000-0000-0000-0000000000ea','client','active','Pago','pago@teste.local','25825825825','17999990014','01001000','Rua C','3','São Paulo','SP',now());
insert into public.checkouts(client_id, total_amount, status) values ('00000000-0000-0000-0000-0000000000e9', 50, 'pending'), ('00000000-0000-0000-0000-0000000000ea', 50, 'approved');
do $$
declare r text; failed boolean := false;
begin
  -- Sem a função, o mesmo erro do Supabase:
  begin delete from public.profiles where id = '00000000-0000-0000-0000-0000000000e9';
  exception when foreign_key_violation then failed := true; end;
  assert failed, 'reproduz o erro original';
  r := public.admin_purge_test_account('teste-excluir@teste.local');
  assert r like 'PRÉVIA%1 compra%', r;
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000e9'), 'prévia não apaga';
  r := public.admin_purge_test_account('TESTE-excluir@teste.local', true);
  assert not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000e9'), 'login apagado';
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000e9'), 'perfil apagado';
  assert not exists (select 1 from public.checkouts where client_id = '00000000-0000-0000-0000-0000000000e9'), 'compra não paga apagada';
  failed := false;
  begin perform public.admin_purge_test_account('pago@teste.local', true);
  exception when others then failed := sqlerrm like '%paga%'; end;
  assert failed, 'conta com compra paga é recusada';
end $$;
select 'ok: excluir_conta_teste';
rollback;
