-- Teste: abrir a conversa marca todos os avisos dela como lidos (rodar SOMENTE
-- em banco local, depois de migrations/20261112_notificacoes_lidas_por_conversa.sql).
begin;
set local client_min_messages = warning;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000f7', 'leitora@teste.local'), ('00000000-0000-0000-0000-0000000000f8', 'outra@teste.local');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, terms_accepted_at)
values ('00000000-0000-0000-0000-0000000000f7','client','active','Leitora','leitora@teste.local','36936936936','17999990015','01001000','Rua C','3','São Paulo','SP',now()),
       ('00000000-0000-0000-0000-0000000000f8','client','active','Outra','outra@teste.local','74174174174','17999990016','01001000','Rua C','3','São Paulo','SP',now());
insert into public.notifications(user_id, kind, title, body, link, ref_id) values
  ('00000000-0000-0000-0000-0000000000f7', 'mensagem', 'Nova mensagem', 'oi', '/mensagens', '00000000-0000-0000-0000-00000000c0c0'),
  ('00000000-0000-0000-0000-0000000000f7', 'pedido', 'Pedido', 'x', '/pedidos', '00000000-0000-0000-0000-00000000d0d0'),
  ('00000000-0000-0000-0000-0000000000f8', 'mensagem', 'Nova mensagem', 'oi', '/mensagens', '00000000-0000-0000-0000-00000000c0c0');
do $$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f7', true);
  n := public.mark_notifications_read_by_ref('00000000-0000-0000-0000-00000000c0c0');
  assert n = 1, 'marca o aviso da conversa: ' || n;
  assert exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000f7' and kind = 'pedido' and read_at is null), 'não mexe em outro assunto';
  assert exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000f8' and read_at is null), 'não mexe nos avisos de outra pessoa';
  assert public.mark_notifications_read_by_ref('00000000-0000-0000-0000-00000000c0c0') = 0, 'repetir não faz nada';
end $$;
select 'ok: notificacoes_lidas_por_conversa';
rollback;
