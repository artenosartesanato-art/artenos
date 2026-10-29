-- Teste do filtro de termos (rodar SOMENTE em banco local de teste, depois de
-- migrations/20261029_moderacao_chat.sql e moderacao_termos.sql).
-- Os casos são os mesmos de tests/unit/moderation.test.ts.
begin;
set local client_min_messages = warning;

do $$
declare t text;
begin
  assert public.moderation_tokens('P0RR4') = array['pora'], 'leetspeak';
  assert public.moderation_tokens('p.u.t.a') = array['puta'], 'letras separadas';
  assert public.moderation_tokens('puuuuuta') = array['puta'], 'repetições';
  assert public.moderation_tokens('Desgraçado!') = array['desgracado'], 'acentos';
  foreach t in array array['corno', 'puta', 'p0rr4', 'p.u.t.a', 'P U T A', 'puuuta', 'seu c0rn0', 'CARALHO',
    'vai se f0der', 'fdp', 'f d p', 'putas', 'otários'] loop
    assert public.moderation_find_term(t) is not null, 'deveria bloquear: ' || t;
  end loop;
  foreach t in array array['Olá! Gostaria de saber mais sobre Copo EJN.', 'Meu computador quebrou, posso pagar amanhã?',
    'A peça custa R$ 30,00 e chega em 3 dias.', 'Tem cupom de desconto? Moro em Curitiba.',
    'Quero uma disputa justa e um bordado com picote.', 'Adoro o acabamento escrito à mão, é um capuz lindo.',
    'Aceito sugestões: bota, sapato, putz que lindo'] loop
    assert public.moderation_find_term(t) is null, 'não deveria bloquear: ' || t;
  end loop;
end $$;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'loja-chat@teste.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'cliente-chat@teste.local');
delete from public.profiles where id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
insert into public.profiles(id, account_type, approval_status, full_name, email, document, phone, cep, address, address_number, city, state, store_name, terms_accepted_at)
values
  ('00000000-0000-0000-0000-0000000000b1','artisan','active','Loja Chat','loja-chat@teste.local','44444444444','17999990004','15086426','Rua A','1','Rio Preto','SP','Loja Chat',now()),
  ('00000000-0000-0000-0000-0000000000b2','client','active','Cliente Chat','cliente-chat@teste.local','55555555555','17999990005','01001000','Rua C','3','São Paulo','SP',null,now());
insert into public.conversations(id, client_id, artisan_id, product_name_snapshot)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1','Peça teste');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$
declare r jsonb; failed boolean := false;
begin
  r := public.send_chat_message('00000000-0000-0000-0000-0000000000d1', 'Olá, tudo bem?');
  assert r->>'status' = 'sent', 'mensagem normal: ' || r::text;
  r := public.send_chat_message('00000000-0000-0000-0000-0000000000d1', 'c0rn0');
  assert r->>'status' = 'blocked', 'termo: ' || r::text;
  assert (select count(*) from public.moderation_attempts where user_id = auth.uid()) = 1, 'tentativa registrada';
  -- Insert direto também é barrado.
  begin
    insert into public.messages(conversation_id, sender_id, body) values ('00000000-0000-0000-0000-0000000000d1', auth.uid(), 'p.u.t.a');
  exception when check_violation then failed := true; end;
  assert failed, 'insert direto deveria falhar';
  for i in 1..4 loop r := public.send_chat_message('00000000-0000-0000-0000-0000000000d1', 'porra'); end loop;
  assert r->>'status' = 'suspended', 'quinta tentativa suspende: ' || r::text;
  r := public.send_chat_message('00000000-0000-0000-0000-0000000000d1', 'Desculpe');
  assert r->>'status' = 'suspended', 'suspenso não envia';
  assert public.report_conversation('00000000-0000-0000-0000-0000000000d1', 'ofensa', 'teste') is not null, 'denúncia';
end $$;

select 'ok: moderacao_chat' as resultado;
rollback;
